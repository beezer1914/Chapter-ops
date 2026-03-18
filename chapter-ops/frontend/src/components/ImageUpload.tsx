import { useState, useRef } from "react";

interface ImageUploadProps {
  currentImageUrl?: string | null;
  onUpload: (file: File) => Promise<void>;
  onDelete?: () => Promise<void>;
  label: string;
  maxSizeMB?: number;
  acceptedFormats?: string[];
}

export default function ImageUpload({
  currentImageUrl,
  onUpload,
  onDelete,
  label,
  maxSizeMB = 5,
  acceptedFormats = ["jpg", "jpeg", "png", "webp"],
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !acceptedFormats.includes(ext)) {
      setError(`Invalid file type. Accepted: ${acceptedFormats.join(", ")}`);
      return;
    }

    // Validate file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(`File too large. Maximum size: ${maxSizeMB}MB`);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Upload
      await onUpload(file);
    } catch (err: any) {
      setError(err.response?.data?.error || "Upload failed");
      setPreview(currentImageUrl || null);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setUploading(true);
    setError(null);

    try {
      await onDelete();
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Delete failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      {preview && (
        <div className="relative inline-block">
          <img
            src={preview}
            alt="Preview"
            className="h-32 w-32 rounded-lg object-cover border-2 border-gray-200"
          />
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={uploading}
              className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 disabled:opacity-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.map((f) => `.${f}`).join(",")}
          onChange={handleFileSelect}
          disabled={uploading}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
        <p className="mt-1 text-xs text-gray-500">
          Accepted formats: {acceptedFormats.join(", ")} (max {maxSizeMB}MB)
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {uploading && (
        <div className="text-sm text-blue-600">Uploading...</div>
      )}
    </div>
  );
}
