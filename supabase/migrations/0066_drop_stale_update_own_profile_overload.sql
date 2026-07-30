-- Migracja 0066: usunięcie nieaktualnego przeciążenia update_own_profile.
-- Po 0065 w bazie pozostały dwa warianty funkcji (stary z favorite_sport/skill_level
-- jako wymaganymi argumentami oraz nowy z p_bio). Dwa przeciążenia mogą powodować
-- niejednoznaczność przy wywołaniu przez PostgREST (zapis profilu wisiał na „ładowanie…").
-- Zostawiamy wyłącznie nowy wariant z p_bio i p_sports.

drop function if exists public.update_own_profile(boolean, text, text, text, text, text[]);

notify pgrst, 'reload schema';
