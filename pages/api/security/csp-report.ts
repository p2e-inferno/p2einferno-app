import type { NextApiRequest, NextApiResponse } from 'next';

// Rate limiting config (5 reports per minute per IP)
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  max: 5
};

// In-memory cache for rate limiting (consider Redis for production)
const ipCache = new Map<string, { count: number; resetTime: number }>();

// Helper function to check rate limit
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipCache.get(ip);
  
  if (!record || now > record.resetTime) {
    // Reset or create new record
    ipCache.set(ip, { count: 1, resetTime: now + RATE_LIMIT.windowMs });
    return true;
  }
  
  if (record.count >= RATE_LIMIT.max) {
    return false;
  }
  
  record.count++;
  return true;
}

// Helper function to parse CSP report body
function parseCspReportBody(body: any, contentType: string): any {
  if (contentType.includes('application/json')) {
    return body; // Already parsed by Next.js
  }
  
  if (contentType.includes('application/csp-report')) {
    // Next.js doesn't parse application/csp-report as JSON, so we need to handle it manually
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch (err) {
        console.error('Failed to parse CSP report body:', err);
        return null;
      }
    }
    return body;
  }
  
  return null;
}

// Helper function to log to external services (placeholder for Sentry/other services)
async function logToExternalService(level: string, data: any) {
  try {
    // TODO: Replace with your actual error tracking service
    // Example: await logToSentry(level, data);
    // Example: await logToDatadog(level, data);
    console.log(`[${level.toUpperCase()}] External logging:`, data);
  } catch (err) {
    console.error('Failed to log to external service:', err);
  }
}

export default async function cspReportHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // 1. Rate limiting
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;
  
  if (!checkRateLimit(ip)) {
    console.warn(`CSP report rate limited for IP: ${ip}`);
    return res.status(429).json({ 
      status: 'rate_limited',
      message: 'Too many requests',
      retry_after: Math.ceil(RATE_LIMIT.windowMs / 1000)
    });
  }

  // 2. Validate content type (accept both standard and JSON)
  const contentType = req.headers['content-type'];
  if (!contentType || 
      !(contentType.includes('application/csp-report') || 
        contentType.includes('application/json'))) {
    return res.status(415).json({ 
      status: 'invalid_content_type',
      message: 'Content-Type must be application/csp-report or application/json',
      accepted_types: ['application/csp-report', 'application/json']
    });
  }

  // 3. Process valid reports
  if (req.method === 'POST') {
    try {
      // Parse the request body based on content type
      const parsedBody = parseCspReportBody(req.body, contentType);
      
      if (!parsedBody) {
        return res.status(400).json({ 
          status: 'parse_error',
          message: 'Failed to parse request body',
          content_type: contentType,
          raw_body: req.body
        });
      }

      // Extract report data based on content type
      let report;
      if (contentType.includes('application/csp-report')) {
        // Standard CSP format: { "csp-report": { ... } }
        report = parsedBody['csp-report'];
      } else {
        // JSON format: direct report object
        report = parsedBody;
      }
      
      if (!report || typeof report !== 'object') {
        return res.status(400).json({ 
          status: 'invalid_report',
          message: 'Invalid or missing report data',
          received_body: parsedBody,
          content_type: contentType
        });
      }

      // 4. Sanitize and validate required fields
      const sanitizedReport = {
        documentUri: report['document-uri'] || report['documentUri'] || null,
        violatedDirective: report['violated-directive'] || report['violatedDirective'] || null,
        blockedUri: report['blocked-uri'] || report['blockedUri'] || null,
        lineNumber: report['line-number'] || report['lineNumber'] || null,
        columnNumber: report['column-number'] || report['columnNumber'] || null,
        sourceFile: report['source-file'] || report['sourceFile'] || null,
        statusCode: report['status-code'] || report['statusCode'] || null,
        userAgent: req.headers['user-agent'] || null,
        timestamp: new Date().toISOString(),
        ip: ip,
        originalReport: report // Keep original for debugging
      };

      // 5. Validate that we have at least the essential fields
      if (!sanitizedReport.documentUri || !sanitizedReport.violatedDirective) {
        return res.status(400).json({ 
          status: 'incomplete_report',
          message: 'Missing required fields: document-uri and violated-directive',
          received_fields: Object.keys(report),
          sanitized_fields: Object.keys(sanitizedReport)
        });
      }

      // 6. Log to multiple outputs
      console.warn('CSP Violation:', sanitizedReport); // Local dev
      
      // Structured logging for production
      console.log(JSON.stringify({
        level: 'warn',
        message: 'CSP_VIOLATION',
        timestamp: sanitizedReport.timestamp,
        data: sanitizedReport
      }));

      // External service logging
      await logToExternalService('warning', {
        type: 'csp_violation',
        ...sanitizedReport
      });

      // 7. Return success (202 Accepted - report received but not necessarily processed)
      return res.status(202).json({ 
        status: 'accepted',
        message: 'CSP violation report received',
        report_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content_type_processed: contentType
      });

    } catch (err) {
      console.error('Error processing CSP report:', err);
      return res.status(500).json({ 
        status: 'processing_error',
        message: 'Failed to process report',
        error_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
    }
  }

  // 8. Handle unsupported methods
  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ 
    status: 'method_not_allowed',
    message: 'Only POST requests accepted',
    allowed_methods: ['POST']
  });
}

// Clean up expired rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipCache.entries()) {
    if (now > record.resetTime) {
      ipCache.delete(ip);
    }
  }
}, RATE_LIMIT.windowMs);
