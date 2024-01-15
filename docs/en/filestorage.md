[JP](../ja/filestorage.md) | EN

# REDCap File Storage

## Amazon S3 integration

By default containers don't persist the data for stateless applications at scale, but containerized applications require data persistant using the storage when the container terminates.

The containers running in AWS AppRunner do not have any additional storage attached besides the ephemeral 3GB. The recommendation here is to enable REDCap's Amazon S3 integration that requires IAM access credentials and enablement in the `redcap_config` table. Automatically generated SQL to enable the integration can be obtained by running `yarn gen redcap config` as follows.

```
Use S3 bucket as storage for REDCap? ・ Yes
```

### Versioning in the bucket

Versioning in an Amazon S3 bucket enables you to preserve, retrieve and restore the every version of all of files in your buckets. Enabled versioing can help your appliation recover objects from accidental deletion or overwrite. You can enable versioning for any environment, but will be enabled by default when deploying prod environment.
