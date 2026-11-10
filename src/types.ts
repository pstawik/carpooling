/** Parent profile row from `public.profiles`, created by the signup trigger. */
export interface Profile {
  id: string;
  first_name: string;
  nick: string;
  phone: string | null;
  created_at: string;
}
