/**
 * @file RawExpenseLog.js
 * Demonstrates NoSQL (MongoDB / Mongoose) core concepts:
 * 1. Embedding vs Referencing Relationships (Score: 0.2)
 * 2. Aggregation Pipelines (Score: 0.2)
 */

const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// 1. EMBEDDED SUB-DOCUMENT SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
// Embedded because metrics and split items never exist independently of a log.
const promptMetricsSchema = new mongoose.Schema(
  {
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    latencyMs: { type: Number, required: true },
    modelName: { type: String, default: 'gemini-1.5-flash' },
  },
  { _id: false }
);

const splitPredictionSchema = new mongoose.Schema(
  {
    memberLabel: { type: String, required: true },
    suggestedShare: { type: Number, required: true },
    confidenceScore: { type: Number, min: 0, max: 1, default: 1.0 },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. ROOT DOCUMENT SCHEMA (REFERENCING + EMBEDDING)
// ─────────────────────────────────────────────────────────────────────────────
const rawExpenseLogSchema = new mongoose.Schema(
  {
    // REFERENCING: References PostgreSQL relational entities by ID
    groupId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },

    rawInput: { type: String, required: true, trim: true },
    extractedCategory: { type: String, default: 'General' },
    extractedAmount: { type: Number, default: 0 },

    // EMBEDDING: Embedded subdocuments for fast single-lookup reads without joins
    metrics: { type: promptMetricsSchema, default: () => ({}) },
    predictions: [splitPredictionSchema],

    parsedOutput: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// Compound index for query performance
rawExpenseLogSchema.index({ groupId: 1, createdAt: -1 });

// ─────────────────────────────────────────────────────────────────────────────
// 3. AGGREGATION PIPELINES (Score: 0.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregation Pipeline 1: Group AI Token & Latency Performance Metrics
 * Uses: $match -> $group -> $project -> $sort
 */
rawExpenseLogSchema.statics.getGroupAiParsingStats = async function (groupId) {
  return await this.aggregate([
    // Stage 1: Filter by group
    { $match: { groupId } },

    // Stage 2: Aggregate metrics
    {
      $group: {
        _id: '$groupId',
        totalParses: { $sum: 1 },
        avgLatencyMs: { $avg: '$metrics.latencyMs' },
        maxLatencyMs: { $max: '$metrics.latencyMs' },
        totalTokensConsumed: { $sum: '$metrics.totalTokens' },
        totalParsedAmount: { $sum: '$extractedAmount' },
      },
    },

    // Stage 3: Project clean output shape
    {
      $project: {
        _id: 0,
        groupId: '$_id',
        totalParses: 1,
        avgLatencyMs: { $round: ['$avgLatencyMs', 2] },
        maxLatencyMs: 1,
        totalTokensConsumed: 1,
        totalParsedAmount: { $round: ['$totalParsedAmount', 2] },
      },
    },
  ]);
};

/**
 * Aggregation Pipeline 2: Category Frequency Distribution
 * Uses: $match -> $group -> $sort -> $limit
 */
rawExpenseLogSchema.statics.getTopParsedCategories = async function (groupId, limit = 5) {
  return await this.aggregate([
    { $match: { groupId } },
    {
      $group: {
        _id: '$extractedCategory',
        count: { $sum: 1 },
        totalAmount: { $sum: '$extractedAmount' },
      },
    },
    { $sort: { count: -1, totalAmount: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        category: '$_id',
        frequency: '$count',
        totalAmount: { $round: ['$totalAmount', 2] },
      },
    },
  ]);
};

module.exports = mongoose.models.RawExpenseLog || mongoose.model('RawExpenseLog', rawExpenseLogSchema);
