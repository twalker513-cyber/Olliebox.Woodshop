const PRODUCTS_PATH = "data/products.json";
const DEFAULT_BRANCH = process.env.GITHUB_BRANCH || "main";
const ORDER_ALERT_TO = process.env.ORDER_ALERT_TO || "ollieboxwoodshop@gmail.com";
const ORDER_ALERT_FROM = process.env.ORDER_ALERT_FROM || "ollieboxwoodshop@gmail.com";

async function githubRequest(path, options = {}) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error(
      "Missing GitHub environment variables. Add GITHUB_OWNER, GITHUB_REPO, and GITHUB_TOKEN in Netlify."
    );
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || `GitHub request failed with status ${response.status}`);
  }

  return data;
}

async function snipcartInventoryRequest(productId, stock) {
  const apiKey = process.env.SNIPCART_SECRET_API_KEY;

  if (!apiKey) {
    console.log("Skipping Snipcart inventory sync. Missing SNIPCART_SECRET_API_KEY in Netlify.");
    return { skipped: true };
  }

  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const response = await fetch(
    `https://app.snipcart.com/api/products/${encodeURIComponent(productId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inventoryManagementMethod: "Single",
        stock,
        allowOutOfStockPurchases: false,
      }),
    }
  );

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || `Snipcart inventory sync failed with status ${response.status}`);
  }

  return data;
}

async function sendMerchantOrderEmail(payload, changedProducts, snipcartSyncResults) {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;

  if (!sendgridApiKey) {
    console.log("Skipping merchant order email. Missing SENDGRID_API_KEY in Netlify.");
    return { skipped: true };
  }

  const order = payload.content || {};
  const items = getPurchasedItems(payload);
  const orderNumber = order.invoiceNumber || order.token || order.reference || "New Snipcart Order";
  const customerName = order.billingAddress?.fullName || order.shippingAddress?.fullName || order.email || "Unknown customer";
  const customerEmail = order.email || order.billingAddress?.email || "No email provided";
  const total = order.finalGrandTotal || order.total || order.grandTotal || "Unknown total";
  const currency = order.currency || "USD";

  const itemLines = items
    .map((item) => {
      const quantity = getPurchasedQuantity(item);
      const name = item.name || item.id || "Unnamed item";
      const price = item.price || item.unitPrice || "";
      return `- ${quantity} x ${name}${price ? ` — ${currency} ${price}` : ""}`;
    })
    .join("\n");

  const inventoryLines = changedProducts
    .map((product) => `- ${product.name || product.id}: stock is now ${product.stock}${product.status ? ` (${product.status})` : ""}`)
    .join("\n");

  const syncLines = snipcartSyncResults
    .map((result) => `- ${result.productId}: ${result.success ? "synced" : `failed - ${result.error}`}`)
    .join("\n");

  const shipping = order.shippingAddress || {};
  const shippingAddress = [
    shipping.fullName,
    shipping.address1,
    shipping.address2,
    shipping.city,
    shipping.province || shipping.state,
    shipping.postalCode,
    shipping.country,
  ]
    .filter(Boolean)
    .join("\n");

  const text = `New Ollie Box Woodshop order received.\n\nOrder: ${orderNumber}\nCustomer: ${customerName}\nEmail: ${customerEmail}\nTotal: ${currency} ${total}\n\nItems:\n${itemLines || "No items listed."}\n\nShipping Address:\n${shippingAddress || "No shipping address listed."}\n\nInventory Updates:\n${inventoryLines || "No inventory updates listed."}\n\nSnipcart Inventory Sync:\n${syncLines || "No Snipcart sync results listed."}\n`;

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: ORDER_ALERT_TO }],
          subject: `New Ollie Box Order: ${orderNumber}`,
        },
      ],
      from: { email: ORDER_ALERT_FROM, name: "Ollie Box Woodshop" },
      content: [{ type: "text/plain", value: text }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Merchant order email failed with status ${response.status}: ${errorText}`);
  }

  console.log(`Merchant order email sent to ${ORDER_ALERT_TO}.`);
  return { success: true, to: ORDER_ALERT_TO };
}

function decodeBase64(content) {
  return Buffer.from(content, "base64").toString("utf8");
}

function encodeBase64(content) {
  return Buffer.from(content, "utf8").toString("base64");
}

function getPurchasedItems(payload) {
  return payload.content?.items || [];
}

function getPurchasedQuantity(item) {
  return Number(item.quantity || item.qty || 1);
}

function normalizeProductId(id) {
  return String(id || "").trim().toLowerCase();
}

function updateProductInventory(productsData, purchasedItems) {
  const products = Array.isArray(productsData) ? productsData : productsData.products || [];
  const purchasedMap = new Map();

  purchasedItems.forEach((item) => {
    const id = normalizeProductId(item.id);
    const quantity = getPurchasedQuantity(item);

    if (!id || quantity <= 0) return;

    purchasedMap.set(id, (purchasedMap.get(id) || 0) + quantity);
  });

  let changed = false;
  const changedProducts = [];

  const updatedProducts = products.map((product) => {
    const quantityPurchased = purchasedMap.get(normalizeProductId(product.id));

    if (!quantityPurchased) return product;

    const currentStock = Number(product.stock || 0);
    const newStock = Math.max(currentStock - quantityPurchased, 0);
    const updatedProduct = {
      ...product,
      stock: newStock,
      ...(newStock <= 0 ? { status: "sold" } : {}),
    };

    changed = true;
    changedProducts.push(updatedProduct);

    return updatedProduct;
  });

  if (!changed) {
    return { changed: false, productsData, changedProducts };
  }

  if (Array.isArray(productsData)) {
    return { changed: true, productsData: updatedProducts, changedProducts };
  }

  return {
    changed: true,
    changedProducts,
    productsData: {
      ...productsData,
      products: updatedProducts,
    },
  };
}

async function syncChangedProductsToSnipcart(changedProducts) {
  const results = [];

  for (const product of changedProducts) {
    const productId = product.id;
    const stock = Number(product.stock || 0);

    if (!productId) continue;

    try {
      const result = await snipcartInventoryRequest(productId, stock);
      results.push({ productId, stock, success: true, result });
      console.log(`Snipcart inventory synced for ${productId}. Stock: ${stock}`);
    } catch (error) {
      results.push({ productId, stock, success: false, error: error.message });
      console.error(`Snipcart inventory sync failed for ${productId}:`, error.message);
    }
  }

  return results;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: "Method Not Allowed",
      };
    }

    const payload = JSON.parse(event.body || "{}");

    console.log("Snipcart webhook received:", payload.eventName);

    if (payload.eventName !== "order.completed") {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, ignored: true }),
      };
    }

    const purchasedItems = getPurchasedItems(payload);

    if (!purchasedItems.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: "No purchased items found." }),
      };
    }

    const file = await githubRequest(`/contents/${PRODUCTS_PATH}?ref=${DEFAULT_BRANCH}`);
    const productsData = JSON.parse(decodeBase64(file.content));
    const updateResult = updateProductInventory(productsData, purchasedItems);

    if (!updateResult.changed) {
      console.log("No matching products found to update.");

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: "No matching products found." }),
      };
    }

    await githubRequest(`/contents/${PRODUCTS_PATH}`, {
      method: "PUT",
      body: JSON.stringify({
        message: "Update inventory after Snipcart order",
        content: encodeBase64(`${JSON.stringify(updateResult.productsData, null, 2)}\n`),
        sha: file.sha,
        branch: DEFAULT_BRANCH,
      }),
    });

    const snipcartSyncResults = await syncChangedProductsToSnipcart(updateResult.changedProducts);
    const merchantEmailResult = await sendMerchantOrderEmail(
      payload,
      updateResult.changedProducts,
      snipcartSyncResults
    );

    console.log("Inventory updated successfully.");

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Inventory updated.",
        snipcartSyncResults,
        merchantEmailResult,
      }),
    };
  } catch (error) {
    console.error("Webhook error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};
