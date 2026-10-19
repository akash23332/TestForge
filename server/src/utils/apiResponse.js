/**
 * Standard API Response utilities for TestForge REST APIs.
 */
export class ApiResponse {
  /**
   * Send a standardized success response.
   * @param {import('express').Response} res
   * @param {number} statusCode
   * @param {any} data
   * @param {string} message
   * @param {object} meta
   */
  static success(res, statusCode = 200, data = null, message = 'Success', meta = null) {
    const payload = {
      success: true,
      message,
      ...(data !== null && { data }),
      ...(meta && { meta })
    };
    return res.status(statusCode).json(payload);
  }

  /**
   * Send a paginated response with standardized bounds and metadata.
   */
  static paginated(res, items, page, limit, total, extraMeta = {}) {
    const totalPages = Math.ceil(total / limit) || 1;
    return res.status(200).json({
      success: true,
      data: items,
      meta: {
        page: Number(page),
        limit: Number(limit),
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        ...extraMeta
      }
    });
  }
}

export default ApiResponse;
