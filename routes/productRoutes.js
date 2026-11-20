const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");

const router = express.Router();

// 1. CREATE PRODUCT
router.post("/", async (req, res, next) => {
  try {
    const product = await Product.create(req.body);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET ALL PRODUCTS WITH FILTERING, SORTING AND PAGINATION
router.get("/", async (req, res, next) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      sort = "-createdAt",
      page = 1,
      limit = 10
    } = req.query;

    const filter = {};

    if (category) {
      filter.category = new RegExp(
        "^" + category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
        "i"
      );
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};

      if (minPrice !== undefined) {
        const value = Number(minPrice);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({
            success: false,
            message: "minPrice must be a non-negative number"
          });
        }
        filter.price.$gte = value;
      }

      if (maxPrice !== undefined) {
        const value = Number(maxPrice);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({
            success: false,
            message: "maxPrice must be a non-negative number"
          });
        }
        filter.price.$lte = value;
      }

      if (
        filter.price.$gte !== undefined &&
        filter.price.$lte !== undefined &&
        filter.price.$gte > filter.price.$lte
      ) {
        return res.status(400).json({
          success: false,
          message: "minPrice cannot be greater than maxPrice"
        });
      }
    }

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(limitNumber) ||
      limitNumber < 1 ||
      limitNumber > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "page must be positive and limit must be between 1 and 100"
      });
    }

    const allowedSortFields = [
      "name",
      "-name",
      "price",
      "-price",
      "quantity",
      "-quantity",
      "createdAt",
      "-createdAt"
    ];

    if (!allowedSortFields.includes(sort)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sort field"
      });
    }

    const [products, totalProducts] = await Promise.all([
      Product.find(filter)
        .sort(sort)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),

      Product.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      totalProducts,
      currentPage: pageNumber,
      totalPages: Math.ceil(totalProducts / limitNumber),
      data: products
    });
  } catch (error) {
    next(error);
  }
});

// 3. LOW-STOCK REPORT
router.get("/low-stock", async (req, res, next) => {
  try {
    const products = await Product.aggregate([
      {
        $match: {
          $expr: {
            $lte: ["$quantity", "$reorderLevel"]
          }
        }
      },
      {
        $sort: {
          quantity: 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    next(error);
  }
});

// 4. CATEGORY-WISE INVENTORY SUMMARY
router.get("/summary", async (req, res, next) => {
  try {
    const summary = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalStockValue: {
            $sum: {
              $multiply: ["$price", "$quantity"]
            }
          },
          avgPrice: { $avg: "$price" }
        }
      },
      {
        $sort: {
          _id: 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      categories: summary.length,
      summary
    });
  } catch (error) {
    next(error);
  }
});

// 5. GET SINGLE PRODUCT BY ID
router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// 6. UPDATE PRODUCT DETAILS
router.put("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    const allowedFields = [
      "name",
      "sku",
      "category",
      "price",
      "quantity",
      "reorderLevel",
      "supplier"
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one valid field to update"
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updates,
      {
        new: true,
        runValidators: true
      }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// 7. STOCK ADJUSTMENT: RESTOCK OR SALE
router.patch("/:id/stock", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    const { operation, quantity } = req.body;

    if (
      !["restock", "sale"].includes(operation) ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Operation must be restock or sale, and quantity must be a positive integer"
      });
    }

    const update =
      operation === "restock"
        ? { $inc: { quantity: quantity } }
        : {
            $inc: { quantity: -quantity },
            $where: function () {
              return this.quantity >= quantity;
            }
          };

    let product;

    if (operation === "restock") {
      product = await Product.findByIdAndUpdate(
        req.params.id,
        update,
        { new: true, runValidators: true }
      );
    } else {
      product = await Product.findOneAndUpdate(
        {
          _id: req.params.id,
          quantity: { $gte: quantity }
        },
        { $inc: { quantity: -quantity } },
        { new: true, runValidators: true }
      );
    }

    if (!product) {
      const exists = await Product.exists({ _id: req.params.id });

      return res.status(exists ? 400 : 404).json({
        success: false,
        message: exists
          ? "Insufficient stock for this sale"
          : "Product not found"
      });
    }

    res.status(200).json({
      success: true,
      message: operation === "restock"
        ? "Stock restocked successfully"
        : "Sale recorded successfully",
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// 8. DELETE PRODUCT
router.delete("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      data: product
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;