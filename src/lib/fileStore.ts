import { supabase } from '@/lib/supabase'

export type TradeShowFile = {
  id: string
  filename: string
  show_name: string
  storage_path: string
  lead_count: number
  uploaded_at: string
  file_size: number | null
}

/**
 * Uploads a CSV file to the trade-show-uploads bucket and inserts a row in
 * trade_show_files. Returns the inserted row (id, show_name, storage_path) or
 * null if the upload fails. On storage failure the function returns null so
 * the caller can still process the file locally (graceful degradation).
 */
export async function uploadShowFile(
  file: File,
  showName: string
): Promise<{ id: string; show_name: string; storage_path: string } | null> {
  if (file.size > 10 * 1024 * 1024) {
    console.warn('uploadShowFile: file exceeds 10 MB limit, skipping storage upload', file.name)
    return null
  }

  const uuid = crypto.randomUUID()
  const storagePath = `shows/${uuid}_${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('trade-show-uploads')
    .upload(storagePath, file, { upsert: false })

  if (uploadError) {
    console.error('uploadShowFile: storage upload failed', uploadError)
    return null
  }

  const { data, error: insertError } = await supabase
    .from('trade_show_files')
    .insert({
      filename: file.name,
      show_name: showName,
      storage_path: storagePath,
      lead_count: 0,
      file_size: file.size,
    })
    .select('id, show_name, storage_path')
    .single()

  if (insertError) {
    console.error('uploadShowFile: DB insert failed', insertError)
    // Best-effort cleanup of the orphaned storage object
    supabase.storage.from('trade-show-uploads').remove([storagePath]).catch(() => {})
    return null
  }

  return data
}

/**
 * Updates the lead_count on an existing trade_show_files row after the CSV has
 * been parsed and the real row count is known.
 */
export async function updateLeadCount(id: string, count: number): Promise<void> {
  const { error } = await supabase
    .from('trade_show_files')
    .update({ lead_count: count })
    .eq('id', id)
  if (error) console.error('updateLeadCount error', error)
}

/**
 * Returns all rows from trade_show_files ordered newest-first.
 */
export async function listShowFiles(): Promise<TradeShowFile[]> {
  const { data, error } = await supabase
    .from('trade_show_files')
    .select('*')
    .order('uploaded_at', { ascending: false })

  if (error) {
    console.error('listShowFiles error', error)
    return []
  }

  return data ?? []
}

/**
 * Downloads a file from the bucket and returns it as a File object.
 * The original filename is reconstructed by stripping the leading UUID from the
 * storage path basename (format: shows/{uuid}_{originalFilename}).
 */
export async function downloadShowFile(storagePath: string): Promise<File | null> {
  const { data, error } = await supabase.storage
    .from('trade-show-uploads')
    .download(storagePath)

  if (error || !data) {
    console.error('downloadShowFile error', error)
    return null
  }

  // Reconstruct original filename: strip the 36-char UUID + underscore prefix
  const basename = storagePath.split('/').pop() ?? 'file.csv'
  // UUID is 36 chars (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), followed by '_'
  const filename = basename.length > 37 ? basename.slice(37) : basename

  return new File([data], filename, { type: 'text/csv' })
}

/**
 * Deletes a file from both the storage bucket and the trade_show_files table.
 */
export async function deleteShowFile(id: string, storagePath: string): Promise<void> {
  await Promise.all([
    supabase.storage.from('trade-show-uploads').remove([storagePath]),
    supabase.from('trade_show_files').delete().eq('id', id),
  ])
}
