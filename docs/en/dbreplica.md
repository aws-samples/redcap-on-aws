[JP](../ja/dbreplica.md) | EN

# REDCap database read replica

For production environments a quick performance upgrade is to separate the database writes and reads. In environments that are deployed using `yarn deploy`, your Amazon Aurora Serverless will be version V2 with provisioned WRITER instance and 1 or more READERS instances.

REDCap supports passing a read replica database by configuring the `database.php` file.

## SETUP

After deploying the [database stack](../../stacks/Database.ts), this will return a `readReplicaHostname` variable that contains the endpoint for the read replica. This variable is then passed via ENV VARIABLE to the container executed in AWS App Runner. This is implemented in [start_services.sh](../../containers/redcap-docker-apache/scripts/start_services.sh)

```sh
    sed "'$a \$read_replica_hostname[ tab]= '${READ_REPLICA_HOSTNAME}';" /var/www/html/database.php
    sed "'$a \$read_replica_db[ tab]= 'redcap';" /var/www/html/database.php
    sed "'$a \$read_replica_username[ tab]= '${RDS_USERNAME}';" /var/www/html/database.php
    sed "'$a \$read_replica_password[ tab]= '${RDS_PASSWORD}';" /var/www/html/database.php
    echo "Read replica set has been completed"
```

If your database cluster does not have a reader this `readReplicaHostname` variable will not be defined and the replica setup will not be executed. This is the case for `development` mode.
