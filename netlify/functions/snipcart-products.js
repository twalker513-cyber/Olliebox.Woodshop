function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getProductId(product) {
  return String(product.id || product.slug || slugify(product.name)).trim().toLowerCase();
}

function getProductWeight(product) {
  const rawWeight = product.weightGrams || product.weight || product.grams || "";
  const numericWeight = Number(String(rawWeight).replace(/[^0-9.]/g, ""));
  return Number.isFinite(numericWeight) && numericWeight > 0 ? numericWeight : undefined;
}

function getPriceNumber(price) {
  const cleanedPrice = String(price || "0").replace(/[^0-9.]/g, "");
  return Number(cleanedPrice || 0);
}

function buildSnipcartProduct(product) {
  const id = getProductId(product);
  const validationUrl = `https://ollieboxwoodshop.com/.netlify/functions/snipcart-products?id=${id}`;
  const weight = getProductWeight(product);

  return {
    id,
    price: getPriceNumber(product.price),
    url: validationUrl,
    ...(weight ? { weight } : {}),
    customFields: []
  };
}

exports.handler = async function (event) {
  try {
    const requestedId = event.queryStringParameters && event.queryStringParameters.id;
    const response = await fetch("https://ollieboxwoodshop.com/data/products.json");

    if (!response.ok) {
      throw new Error(`Unable to fetch products.json. Status: ${response.status}`);
    }

    const data = await response.json();
    const products = Array.isArray(data) ? data : data.products || [];

    const availableProducts = products.filter((product) => {
      const stock = Number(product.stock || 0);

      return (
        product.status !== "sold" &&
        product.status !== "coming-soon" &&
        stock > 0
      );
    });

    if (requestedId) {
      const normalizedRequestedId = String(requestedId).trim().toLowerCase();
      const product = availableProducts.find((item) => getProductId(item) === normalizedRequestedId);

      if (!product) {
        return {
          statusCode: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
          body: JSON.stringify({ error: "Product not found." })
        };
      }

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(buildSnipcartProduct(product))
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(availableProducts.map(buildSnipcartProduct))
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Unable to load Snipcart products.",
        details: error.message
      })
    };
  }
};
