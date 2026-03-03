import { notFound } from "next/navigation";
import { getPublicCertificateStatus } from "@/lib/services/certificates";

export default async function CertificateVerificationPage({ params }: { params: { certificateId: string } }) {
  const certificate = await getPublicCertificateStatus(params.certificateId);
  if (!certificate) notFound();

  return (
    <main>
      <div className="card">
        <h1>Certificate Verification</h1>
        <p>Certificate ID: {certificate.certificateId}</p>
        <p>Employer: {certificate.legalName}</p>
        <p>USDOT: {certificate.dotNumber || "-"}</p>
        <p>Status: {certificate.status}</p>
        <p>Effective: {certificate.effectiveDate.toISOString().slice(0, 10)}</p>
        <p>Expires: {certificate.expirationDate.toISOString().slice(0, 10)}</p>
        {certificate.status === "VOID" ? (
          <>
            <p className="error">This certificate is void.</p>
          </>
        ) : (
          <p className="success">This certificate is active.</p>
        )}
      </div>
    </main>
  );
}
