require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const productRoutes = require("./routes/productRoutes");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON request bodies
app.use(express.json());

// Welcome route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Inventory Management API is running"
  });
});

// Product API routes
app.use("/api/products", productRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// Centralized error handler (must come after routes)
app.use(errorHandler);

// Connect to MongoDB and start the server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

startServer();