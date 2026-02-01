import { useState, useEffect, useRef } from 'react';
import { files, FileInfoResponse } from '../api';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const [fileList, setFileList] = useState<FileInfoResponse[]>([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; content: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const data = await files.list();
      setFileList(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const result = await files.upload(file);
      if (result.extracted) {
        setError(''); // Clear any previous error
      }
      await loadFiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      await files.delete(filename);
      setDeleting(null);
      if (preview?.name === filename) setPreview(null);
      await loadFiles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePreview = async (filename: string) => {
    if (preview?.name === filename) {
      setPreview(null);
      return;
    }

    setLoadingPreview(true);
    try {
      const data = await files.read(filename);
      setPreview({ name: data.name, content: data.content });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const isTextFile = (name: string) => {
    const ext = name.toLowerCase().split('.').pop() || '';
    return !['pdf', 'xlsx', 'xls'].includes(ext);
  };

  const isExtractedFile = (name: string) => {
    return name.includes('.extracted.');
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Files</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload files for your assistant to read. Supports text, PDF, and Excel files (max 1MB).
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 disabled:opacity-50 transition-colors"
          >
            {uploading ? 'Uploading...' : '+ Upload File'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {fileList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No files uploaded yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Upload text files, PDFs, or Excel files. Your assistant can read them during conversations.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {fileList.map(file => (
            <div key={file.name}>
              <div className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 ${
                isExtractedFile(file.name) ? 'opacity-60 pl-8' : ''
              }`}>
                <div className="flex-shrink-0 text-lg">
                  {file.name.endsWith('.pdf') ? '📄' :
                   file.name.match(/\.xlsx?$/) ? '📊' :
                   isExtractedFile(file.name) ? '📝' : '📁'}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatSize(file.size)} · {new Date(file.modified).toLocaleDateString()}
                    {isExtractedFile(file.name) && ' · Auto-extracted'}
                    {file.tracked && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-hive-50 text-hive-700 border border-hive-200">
                        Tracked
                      </span>
                    )}
                    {file.hasPrev && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        Has prev
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Track changes toggle */}
                  {!isExtractedFile(file.name) && (
                    <label className="flex items-center gap-1.5 cursor-pointer group" title="Track changes between uploads">
                      <input
                        type="checkbox"
                        checked={file.tracked ?? false}
                        onChange={async (e) => {
                          const tracked = e.target.checked;
                          try {
                            await files.setTracked(file.name, tracked);
                            setFileList(prev => prev.map(f =>
                              f.name === file.name ? { ...f, tracked } : f
                            ));
                          } catch (err: any) {
                            setError(err.message);
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-hive-500 focus:ring-hive-400"
                      />
                      <span className="text-xs text-gray-400 group-hover:text-gray-600 transition-colors">Track</span>
                    </label>
                  )}

                  {isTextFile(file.name) && (
                    <button
                      onClick={() => handlePreview(file.name)}
                      className="text-sm text-hive-600 hover:text-hive-700 transition-colors"
                    >
                      {preview?.name === file.name ? 'Hide' : 'Preview'}
                    </button>
                  )}

                  {deleting === file.name ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(file.name)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleting(null)}
                        className="text-sm text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setDeleting(file.name)}
                      className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Preview panel */}
              {preview?.name === file.name && (
                <div className="bg-gray-50 border border-gray-200 border-t-0 rounded-b-xl p-4 -mt-1">
                  {loadingPreview ? (
                    <p className="text-sm text-gray-400">Loading...</p>
                  ) : (
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono max-h-64 overflow-auto">
                      {preview.content.slice(0, 5000)}
                      {preview.content.length > 5000 && '\n\n[Preview truncated]'}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
