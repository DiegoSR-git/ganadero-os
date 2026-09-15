REVOKE EXECUTE ON FUNCTION public.pilot_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_metrics() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_metrics() TO authenticated;