import { Request, Response, NextFunction } from 'express';
import { http } from '../utils/error.util.js';

/**
 * Strict verification enforcement:
 * - Customer MUST be verified to use business APIs.
 * - No overrides.
 */
export function requireVerifiedBusiness(req: Request, res: Response, next: NextFunction) {
  const customer: any = (req as any).customer;

  if (!customer) {
    return http.unauthorized(res, 'UNAUTHORIZED', 'Authentication required', undefined, req);
  }

  const status = customer.verificationStatus || 'verified'; // grandfather safety

  if (status !== 'verified') {
    let message = 'Your account is not verified.';
    let helpText = '';

    if (status === 'inactive') {
      message = 'Account inactive - complete business verification to activate.';
      helpText = 'Submit your business information, compliance questions, and CAC registration number.';
    } else if (status === 'cac_pending') {
      message = 'CAC verification in progress - please wait while we verify your registration.';
      helpText = 'This usually takes a few minutes. Check back shortly.';
    } else if (status === 'cac_verified' || status === 'admin_review') {
      message = 'Verification under admin review - API access will be granted after approval.';
      helpText = 'Average review time: 24-48 hours. You will be notified via email.';
    } else if (status === 'rejected') {
      message = 'Verification rejected - please resubmit with correct information.';
      helpText = (customer.verificationData?.rejectionReason as string) || 'See dashboard for details.';
    }

    return http.forbidden(
      res,
      'ACCOUNT_NOT_VERIFIED',
      message,
      {
        verificationStatus: status,
        helpText,
        verificationUrl: '/customer/verification',
        requirements: [
          'Valid CAC registration number',
          'Business information',
          'Compliance question answers',
          'Contact person details'
        ]
      },
      req
    );
  }

  return next();
}
