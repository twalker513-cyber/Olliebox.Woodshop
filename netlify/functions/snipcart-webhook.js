exports.handler = async (event) => {
  try {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: "Method Not Allowed",
      };
    }

    // Parse Snipcart webhook payload
    const payload = JSON.parse(event.body || "{}");

    console.log("Snipcart webhook received:", payload.eventName);

    // Handle completed orders
    if (payload.eventName === "order.completed") {
      const items = payload.content?.items || [];

      items.forEach((item) => {
        console.log(`Purchased product: ${item.id}`);
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
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
