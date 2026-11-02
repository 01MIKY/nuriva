-- Audit and vetting history are append-only: block UPDATE and DELETE at the database level,
-- so even a compromised application role cannot rewrite history.
CREATE OR REPLACE FUNCTION nuriva_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION nuriva_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER vetting_events_append_only BEFORE UPDATE OR DELETE ON vetting_events
  FOR EACH ROW EXECUTE FUNCTION nuriva_forbid_mutation();
