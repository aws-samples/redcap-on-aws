-- DEFAULT VALUES - Run config from: $yarn run gen redcap config
-- REDCAP CONFIG
UPDATE redcap_config SET value = '0' WHERE field_name = 'api_enabled';
UPDATE redcap_config SET value = '0' WHERE field_name = 'auto_report_stats';
UPDATE redcap_config SET value = 'noreply@mydomain.com' WHERE field_name = 'from_email';
UPDATE redcap_config SET value = 'noreply@mydomain.com' WHERE field_name = 'homepage_contact_email';
UPDATE redcap_config SET value = 'noreply@mydomain.com' WHERE field_name = 'project_contact_email';
UPDATE redcap_config SET value = 'English' WHERE field_name = 'language_global';
UPDATE redcap_config SET value = 'https://mydomain.com' WHERE field_name = 'redcap_base_url';
UPDATE redcap_config SET value = 'table' WHERE field_name = 'auth_meth_global';

-- REDCAP USERS
INSERT IGNORE INTO redcap_auth (username, password, legacy_hash, temp_pwd) VALUES ('site_admin', MD5('changeme'), '1', '1'); 
UPDATE redcap_user_information SET super_user = '0' WHERE username = 'site_admin';