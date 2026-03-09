"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X, FileImage, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ReceiptUploadProps {
  userId: string;
  reportId: string;
  dayIndex: number;
  existingPath?: string | null;
  onUploaded: (path: string | null) => void;
  readOnly?: boolean;
}

export function ReceiptUpload({ userId, reportId, dayIndex, existingPath, onUploaded, readOnly }: ReceiptUploadProps) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [path, setPath] = useState<string | null>(existingPath ?? null);
  const [viewing, setViewing] = useState(false);

  // Sync when existingPath changes (e.g. after storage listing completes)
  useEffect(() => {
    if (existingPath !== undefined) setPath(existingPath);
  }, [existingPath]);

  async function handleUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `${userId}/${reportId}/day${dayIndex}.${ext}`;

      const { error } = await supabase.storage
        .from("expense-receipts")
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      setPath(filePath);
      onUploaded(filePath);
      toast({ title: "Receipt uploaded", variant: "success" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!path) return;
    setUploading(true);
    try {
      await supabase.storage.from("expense-receipts").remove([path]);
      setPath(null);
      onUploaded(null);
      toast({ title: "Receipt removed" });
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleView() {
    if (!path || viewing) return;
    setViewing(true);
    try {
      const { data, error } = await supabase.storage
        .from("expense-receipts")
        .createSignedUrl(path, 300); // 5-minute signed URL

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err: any) {
      toast({ title: "Could not open receipt", description: err.message, variant: "destructive" });
    } finally {
      setViewing(false);
    }
  }

  if (readOnly) {
    if (!path) return null;
    return (
      <button
        onClick={handleView}
        disabled={viewing}
        className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer disabled:opacity-50"
        title="Click to view receipt"
      >
        <Eye className="w-3 h-3" />
        {viewing ? "Opening…" : "View Receipt"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
      {path ? (
        <div className="flex items-center gap-1">
          <button
            onClick={handleView}
            disabled={viewing}
            className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-0.5 transition-colors"
            title="Click to view receipt"
          >
            <FileImage className="w-3 h-3" />
            {viewing ? "Opening…" : "Receipt"}
          </button>
          <button
            onClick={handleRemove}
            disabled={uploading}
            className="text-red-400 hover:text-red-600 disabled:opacity-50"
            title="Remove receipt"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          title="Upload receipt"
        >
          <Upload className="w-3 h-3" />
          {uploading ? "Uploading…" : "Receipt"}
        </button>
      )}
    </div>
  );
}
