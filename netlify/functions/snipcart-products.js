function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getProductId(product) {
  return product.id || product.slug || slugify(product.name);
}

function getPriceNumber(price) {
  const cleanedPrice = String(price || "0").replace(/[^0-9.]/g, "");
  return Number(cleanedPrice || 0);
}

exports.handler = async function () {
  try {
    const response = await fetch("https://ollieboxwoodshop.com/data/products.json");

    if (!response.ok) {
      throw new Error(`Unable to fetch products.json. Status: ${response.status}`);
    }

    const data = await response.json();
    const products = Array.isArray(data) ? data : data.products || [];

    const snipcartProducts = products
      .filter((product) => product.status !== "sold" && product.status !== "coming-soon")
      .map((product) => {
        const id = getProductId(product);

        return {
          id,
          name: product.name,
          price: getPriceNumber(product.price),
          url: "https://ollieboxwoodshop.com/.netlify/functions/snipcart-products",
          customFields: [],
          description: product.description || "Handcrafted by Ollie Box Woodshop.",
          image: Array.isArray(product.images) && product.images.length
            ? product.images[0]
            : product.image || "assets/logo.jpeg"
        };
      });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(snipcartProducts)
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
