---
to: containers/redcap-docker-apache/sql/redcapConfig.sql
---

-- REDCAP CONFIG
UPDATE redcap_config SET value = '<%= enable_api %>' WHERE field_name = 'api_enabled';
UPDATE redcap_config SET value = '<%= auto_report_stats %>' WHERE field_name = 'auto_report_stats';
UPDATE redcap_config SET value = '<%= language %>' WHERE field_name = 'language_global';

<% if (contact_email) { %>
UPDATE redcap_config SET value = '<%= contact_email %>' WHERE field_name = 'from_email';
UPDATE redcap_config SET value = '<%= contact_email %>' WHERE field_name = 'homepage_contact_email';
UPDATE redcap_config SET value = '<%= contact_email %>' WHERE field_name = 'project_contact_email';
<% } %>


<% if (base_url) { %>
UPDATE redcap_config SET value = 'https://<%= base_url %>' WHERE field_name = 'redcap_base_url';
<% } %>

UPDATE redcap_config SET value = 'table' WHERE field_name = 'auth_meth_global';

-- REDCAP USERS
INSERT IGNORE INTO redcap_auth (username, password, legacy_hash, temp_pwd) VALUES ('site_admin', MD5('<%= password %>'), '1', '1'); 
UPDATE redcap_user_information SET super_user = '0' WHERE username = 'site_admin';
UPDATE redcap_user_information SET user_firstname = '<%= siteadmin_firstname %>' WHERE username = 'site_admin';
UPDATE redcap_user_information SET user_lastname = '<%= siteadmin_lastname %>' WHERE username = 'site_admin';
UPDATE redcap_user_information SET user_email = '<%= siteadmin_email %>' WHERE username = 'site_admin';

<% if (use_s3 == '1') { %>
-- S3 Integration
UPDATE redcap_config set value = '2' where field_name = 'edoc_storage_option';
UPDATE redcap_config SET value = 'APPLICATION_BUCKET_NAME' WHERE field_name = 'amazon_s3_bucket';
UPDATE redcap_config SET value = 'REDCAP_IAM_USER_ACCESS_KEY' WHERE field_name = 'amazon_s3_key';
UPDATE redcap_config SET value = 'REDCAP_IAM_USER_SECRET' WHERE field_name = 'amazon_s3_secret'; 
UPDATE redcap_config SET value = 'REGION' WHERE field_name = 'amazon_s3_endpoint'; 
<% } %>
