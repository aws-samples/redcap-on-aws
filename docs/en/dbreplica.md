[JP](../ja/dbreplica.md) | EN

# REDCap database read replica

By default, the deployed Amazon RDS Aurora V2 will create a single reader instance in Multi-AZ configuration (2-zones). REDCap is configured automatically to use this replica using an enviromental variable called `READ_REPLICA_HOSTNAME` that is passed via CDK.

This is performed in the [setup_app.sh](/containers/redcap-docker-apache/scripts/setup_app.sh) and in [redcap_configure.sh](/containers/redcap-docker-apache/scripts/redcap_configure.sh)
