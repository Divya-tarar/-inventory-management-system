function errorHandler(err, req, res, next) {
  console.error("Error:", err.message);

  // Duplicate key error (e.g., duplicate SKU)
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A product with this SKU already exists"
    });
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map(
      (error) => error.message
    );

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: messages
    });
  }

  // Invalid MongoDB ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID or data format"
    });
  }

  // Default server error
  return res.status(500).json({
    success: false,
    message: "Internal server error"
  });
}

module.exports = errorHandler;