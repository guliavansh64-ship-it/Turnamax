import CopyValue from "./copy-value";

export type FirebaseRecord = {
  firebaseProjectId: string | null;
  firebaseAppId: string | null;
  firebaseApiKey: string | null;
  tenantId: string | null;
  appName: string | null;
  status?: string | null;
};

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <div className="border-b border-line/60 py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="label !mb-0">{label}</span>
        {value ? <CopyValue value={value} /> : null}
      </div>
      <p className={`mono text-[12px] mt-1 break-all ${value ? "text-white" : "text-mist"}`}>
        {value || "Not provided yet"}
      </p>
      {hint && <p className="hint !mt-1">{hint}</p>}
    </div>
  );
}

/**
 * Shows exactly what is stored on file for this customer's app configuration.
 * Used by both the customer (their own record) and the platform owner (any
 * customer), so the values used to prepare APKs are always verifiable.
 */
export default function FirebaseSummary({
  record,
  title = "Firebase configuration on file",
}: {
  record: FirebaseRecord | null;
  title?: string;
}) {
  if (!record) {
    return (
      <div className="card p-5">
        <h2 className="font-bold text-sm">{title}</h2>
        <p className="text-mist text-sm mt-2">
          Nothing saved yet. Fill in the form and save a draft — it appears here immediately.
        </p>
      </div>
    );
  }
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-bold text-sm">{title}</h2>
        <span className="tag tag-gray">{record.status ?? "draft"}</span>
      </div>
      <p className="hint !mt-1">
        Server-side reference. The public web API key is safe to display to the owner of the app; no
        service-account credentials are ever stored.
      </p>
      <div className="mt-2">
        <Row label="App name" value={record.appName} />
        <Row label="Tenant ID" value={record.tenantId} hint="Compiled into both APKs for isolation." />
        <Row label="Firebase project ID" value={record.firebaseProjectId} />
        <Row label="Firebase app ID" value={record.firebaseAppId} />
        <Row
          label="Web API key"
          value={record.firebaseApiKey}
          hint="Used in the Firebase client config. Never a service-account key."
        />
      </div>
    </div>
  );
}
