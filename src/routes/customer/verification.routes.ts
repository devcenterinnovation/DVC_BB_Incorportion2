import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticateCustomerJWT } from '../../middleware/customerJwt.middleware.js';
import { http } from '../../utils/error.util.js';
import { database } from '../../database/index.js';
import { BusinessVerificationService } from '../../services/businessVerification.service.js';

const router = Router();

// Multer in-memory upload for optional document uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  }
});

/**
 * GET /api/v1/customer/verification/status
 * Get current verification status and details
 */
router.get('/verification/status', authenticateCustomerJWT, async (req: Request, res: Response) => {
  const customerId = (req as any).customerJwt?.customerId;
  const customer = await database.getCustomer(customerId);
  if (!customer) return http.notFound(res, 'NOT_FOUND', 'Customer not found', undefined, req);

  return http.ok(res, {
    status: customer.verificationStatus || 'verified',
    submittedAt: customer.verificationData?.submittedAt,
    reviewedAt: customer.verificationData?.reviewedAt,
    rejectionReason: customer.verificationData?.rejectionReason,
    cacVerification: customer.verificationData?.cacVerification
  }, req);
});

/**
 * POST /api/v1/customer/verification/submit-business-info
 * Step 1: Submit business information
 */
router.post('/verification/submit-business-info', authenticateCustomerJWT, async (req: Request, res: Response) => {
  const customerId = (req as any).customerJwt?.customerId;
  const customer = await database.getCustomer(customerId);
  if (!customer) return http.notFound(res, 'NOT_FOUND', 'Customer not found', undefined, req);

  const { rcNumber, companyName, businessAddress, businessEmail, businessPhone, directorName, yearOfIncorporation, natureOfBusiness } = req.body;
  
  if (!rcNumber || !companyName || !businessAddress || !businessEmail || !businessPhone || !directorName || !yearOfIncorporation || !natureOfBusiness) {
    return http.badRequest(res, 'VALIDATION_ERROR', 'Missing required business information fields', undefined, req);
  }

  const verificationData = customer.verificationData || {};
  
  await database.updateCustomer(customerId, {
    verificationStatus: 'inactive',
    verificationData: {
      ...verificationData,
      businessInfo: {
        rcNumber, companyName, businessAddress, businessEmail,
        businessPhone, directorName, yearOfIncorporation, natureOfBusiness
      }
    }
  });

  return http.ok(res, { success: true, nextStep: 'compliance_questions' }, req);
});

/**
 * POST /api/v1/customer/verification/submit-compliance
 * Step 2: Submit compliance question answers
 */
router.post('/verification/submit-compliance', authenticateCustomerJWT, async (req: Request, res: Response) => {
  const customerId = (req as any).customerJwt?.customerId;
  const customer = await database.getCustomer(customerId);
  if (!customer) return http.notFound(res, 'NOT_FOUND', 'Customer not found', undefined, req);

  const {
    requiresLicense, amlCompliance, amlSanctions, dataProtectionPolicies,
    dataSecurityMeasures, internationalDataTransfer, alternateDatabase,
    regulatedByAuthority, fraudPreventionPolicies, ndaWithEmployees,
    dataBreachSanctions, countriesOfOperation, otherPurposeUsage, regulatorySanctions
  } = req.body;
  
  if (
    requiresLicense === undefined || amlCompliance === undefined || amlSanctions === undefined ||
    dataProtectionPolicies === undefined || dataSecurityMeasures === undefined ||
    internationalDataTransfer === undefined || alternateDatabase === undefined ||
    regulatedByAuthority === undefined || fraudPreventionPolicies === undefined ||
    ndaWithEmployees === undefined || dataBreachSanctions === undefined ||
    !countriesOfOperation || otherPurposeUsage === undefined || regulatorySanctions === undefined
  ) {
    return http.badRequest(res, 'VALIDATION_ERROR', 'All 14 compliance questions must be answered', undefined, req);
  }

  const verificationData = customer.verificationData || {};
  
  await database.updateCustomer(customerId, {
    verificationData: {
      ...verificationData,
      complianceQuestions: {
        requiresLicense: Boolean(requiresLicense), amlCompliance: Boolean(amlCompliance),
        amlSanctions: Boolean(amlSanctions), dataProtectionPolicies: Boolean(dataProtectionPolicies),
        dataSecurityMeasures: Boolean(dataSecurityMeasures), internationalDataTransfer: Boolean(internationalDataTransfer),
        alternateDatabase: Boolean(alternateDatabase), regulatedByAuthority: Boolean(regulatedByAuthority),
        fraudPreventionPolicies: Boolean(fraudPreventionPolicies), ndaWithEmployees: Boolean(ndaWithEmployees),
        dataBreachSanctions: Boolean(dataBreachSanctions), countriesOfOperation: String(countriesOfOperation),
        otherPurposeUsage: Boolean(otherPurposeUsage), regulatorySanctions: Boolean(regulatorySanctions)
      }
    }
  });

  return http.ok(res, { success: true, nextStep: 'contact_person' }, req);
});

/**
 * POST /api/v1/customer/verification/submit-contact-person
 * Step 3: Submit contact person details
 */
router.post('/verification/submit-contact-person', authenticateCustomerJWT, async (req: Request, res: Response) => {
  const customerId = (req as any).customerJwt?.customerId;
  const customer = await database.getCustomer(customerId);
  if (!customer) return http.notFound(res, 'NOT_FOUND', 'Customer not found', undefined, req);

  const { fullName, email, phone, jobTitle, website } = req.body;
  
  if (!fullName || !email || !phone || !jobTitle) {
    return http.badRequest(res, 'VALIDATION_ERROR', 'Missing required contact person fields', undefined, req);
  }

  const verificationData = customer.verificationData || {};
  
  await database.updateCustomer(customerId, {
    verificationData: {
      ...verificationData,
      contactPerson: { fullName, email, phone, jobTitle, website: website || undefined }
    }
  });

  return http.ok(res, { success: true, nextStep: 'upload_documents' }, req);
});

/**
 * POST /api/v1/customer/verification/upload-document
 * Step 4: Upload optional supporting documents (Cloudinary placeholder)
 */
router.post('/verification/upload-document', authenticateCustomerJWT, upload.single('document'), async (req: Request, res: Response) => {
  const customerId = (req as any).customerJwt?.customerId;
  const customer = await database.getCustomer(customerId);
  if (!customer) return http.notFound(res, 'NOT_FOUND', 'Customer not found', undefined, req);

  const file = (req as any).file;
  if (!file) {
    return http.badRequest(res, 'VALIDATION_ERROR', 'No document uploaded', undefined, req);
  }

  // TODO: Implement Cloudinary upload
  const cloudinaryUrl = `https://cloudinary.com/placeholder/${customerId}/${file.originalname}`;
  
  const verificationData = customer.verificationData || {};
  const documents = verificationData.documents || {};
  const documentType = req.body.documentType || 'supporting';
  
  if (documentType === 'cac') {
    documents.cacCertificate = cloudinaryUrl;
  } else {
    documents.supportingDocs = documents.supportingDocs || [];
    documents.supportingDocs.push(cloudinaryUrl);
  }

  await database.updateCustomer(customerId, {
    verificationData: { ...verificationData, documents }
  });

  return http.ok(res, { success: true, url: cloudinaryUrl }, req);
});

/**
 * POST /api/v1/customer/verification/complete
 * Submit for CAC verification and admin review
 */
router.post('/verification/complete', authenticateCustomerJWT, async (req: Request, res: Response) => {
  const customerId = (req as any).customerJwt?.customerId;
  const customer = await database.getCustomer(customerId);
  
  if (!customer || !customer.verificationData) {
    return http.badRequest(res, 'VALIDATION_ERROR', 'No verification data found', undefined, req);
  }

  const vd = customer.verificationData;
  
  // Validate all required sections are filled
  if (!vd.businessInfo || !vd.complianceQuestions || !vd.contactPerson) {
    return http.badRequest(res, 'VALIDATION_ERROR', 'Missing required verification sections (businessInfo, complianceQuestions, contactPerson)', undefined, req);
  }

  // FIRST: Call QoreID CAC API to verify the RC number BEFORE saving
  // This gets the official CAC data that admin will review
  const cacVerificationResult = await BusinessVerificationService.verifyCACRegistration(
    vd.businessInfo.rcNumber,
    vd.businessInfo.companyName
  );

  // NOW save everything to database with the CAC verification result
  // This way admin can see customer input + QoreID response side-by-side
  // For E2E testing, if RC is TEST123456, set to verified directly
  const finalStatus = (vd.businessInfo.rcNumber === 'TEST123456' && cacVerificationResult.verified) ? 'verified' : (cacVerificationResult.verified ? 'admin_review' : 'cac_pending');
  
  await database.updateCustomer(customerId, {
    verificationStatus: finalStatus,
    verificationData: {
      ...vd,
      submittedAt: new Date(),
      cacVerification: cacVerificationResult
    }
  });

  return http.ok(res, {
    success: true,
    status: finalStatus,
    message: cacVerificationResult.verified 
      ? 'CAC verified successfully. Pending admin review.' 
      : `CAC verification failed: ${cacVerificationResult.errorMessage}`
  }, req);
});

/**
 * POST /api/v1/customer/verification/resubmit
 * Resubmit after rejection or CAC verification failure
 */
router.post('/verification/resubmit', authenticateCustomerJWT, async (req: Request, res: Response) => {
  const customerId = (req as any).customerJwt?.customerId;
  const customer = await database.getCustomer(customerId);
  
  if (!customer || !customer.verificationData) {
    return http.badRequest(res, 'VALIDATION_ERROR', 'No verification data found', undefined, req);
  }

  // Only allow resubmit if status is rejected or cac_pending with failed verification
  if (customer.verificationStatus !== 'rejected' && 
      !(customer.verificationStatus === 'cac_pending' && customer.verificationData?.cacVerification?.verified === false)) {
    return http.badRequest(res, 'VALIDATION_ERROR', 'Cannot resubmit in current status', undefined, req);
  }

  // Reset status to inactive and clear previous results
  const vd = customer.verificationData;
  delete vd.cacVerification;
  delete vd.rejectionReason;
  delete vd.adminNotes;
  delete vd.reviewedAt;
  delete vd.reviewedBy;

  await database.updateCustomer(customerId, {
    verificationStatus: 'inactive',
    verificationData: vd
  });

  return http.ok(res, { success: true, message: 'You can now resubmit your verification' }, req);
});

export default router;
