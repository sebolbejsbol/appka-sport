import { supabase } from '@/lib/supabase';

export type DeleteAccountResult =
  | 'deleted'
  | 'not_authenticated'
  | 'user_not_found'
  | 'error';

export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.rpc('delete_my_account');
  if (error) return 'error';
  return (data as DeleteAccountResult | null) ?? 'error';
}
