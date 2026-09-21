/**
 * Google Cloud Storage helper — zero local disk footprint.
 * Uploads buffers then returns time-limited signed read URLs.
 * Requires: GCP_BUCKET_NAME + GCP_SERVICE_ACCOUNT_JSON (or ADC on Cloud Run).
 *
 * Note: On Cloudflare Workers, prefer R2/S3 presign; this module targets
 * Node/Express or Cloud Run sidecars that can use google-cloud-storage.
 */

export type GcsUploadResult = {
  bucket: string;
  object: string;
  publicUrl?: string;
  signedUrl?: string;
};

function getBucketName(): string {
  const name = process.env.GCP_BUCKET_NAME?.trim();
  if (!name) throw new Error("GCP_BUCKET_NAME is not configured");
  return name;
}

/**
 * Dynamic import so the main app boots without the package installed
 * until GCS is actually used.
 */
async function getStorage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("@google-cloud/storage").catch(() => null);
  if (!mod?.Storage) {
    throw new Error(
      "Install @google-cloud/storage to use GCS, or use existing Forge/S3 storagePut.",
    );
  }
  const json = process.env.GCP_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    const credentials = JSON.parse(json);
    return new mod.Storage({ credentials, projectId: credentials.project_id });
  }
  // Application Default Credentials (Cloud Run / GCE)
  return new mod.Storage();
}

export class GCSManager {
  /**
   * Stream/upload a buffer to GCS and return a signed GET URL (default 1h).
   */
  async uploadBuffer(
    objectPath: string,
    data: Buffer | Uint8Array,
    contentType: string,
    signedTtlSeconds = 3600,
  ): Promise<GcsUploadResult> {
    const bucketName = getBucketName();
    const storage = await getStorage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(objectPath.replace(/^\/+/, ""));

    await file.save(Buffer.from(data), {
      contentType,
      resumable: false,
      metadata: { cacheControl: "private, max-age=3600" },
    });

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + signedTtlSeconds * 1000,
    });

    return {
      bucket: bucketName,
      object: objectPath,
      signedUrl,
    };
  }

  /** Delete object after use if policy requires cleanup. */
  async deleteObject(objectPath: string): Promise<void> {
    const storage = await getStorage();
    await storage.bucket(getBucketName()).file(objectPath.replace(/^\/+/, "")).delete({ ignoreNotFound: true });
  }
}

export const gcsManager = new GCSManager();
