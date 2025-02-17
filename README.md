# APM AGENT VERSIONS
This is a function that pulls the last version of the elastic apm agents and publish them to a json file that is placed into a bucket.

## Configuration
1. fileName: This propety holds the fileName that will be contain the versions of the agents.
2. bucketName: This property holds the name of the bucket where the file will be uploaded.
3. accessToken: This is a gh token with public_repo privileges that will use graphql to query the versions in the specific repositories.