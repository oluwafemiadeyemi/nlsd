import { getGraphAccessToken } from "./graphToken";

const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID!;

/**
 * Upload a file to a SharePoint document library via Graph API.
 * Uses simple PUT upload (suitable for files under 4MB).
 * Returns the Graph item id of the uploaded file.
 */
export async function uploadCsvToSharePoint(args: {
  /** Folder path + filename relative to drive root, e.g. "Payroll/Timesheets/2026/03/file.csv" */
  path: string;
  csvContent: string;
}): Promise<{ id: string }> {
  const token = await getGraphAccessToken();

  const encodedPath = args.path.split("/").map(encodeURIComponent).join("/");
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/content`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "text/csv",
    },
    body: args.csvContent,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SharePoint upload failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return { id: data.id as string };
}
