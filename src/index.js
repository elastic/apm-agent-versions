/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const {Storage} = require('@google-cloud/storage');
const fetch = require('node-fetch');

const filename = '';
const bucketName = '';
const accessToken = '';

const mappingNames = {
  "apm-agent-java": "java",
  "apm-agent-dotnet": "dotnet",
  "apm-agent-nodejs": "nodejs",
  "apm-agent-python": "python",
  "apm-agent-go": "go",
  "apm-agent-php": "php",
  "apm-agent-ios": "iOS/swift",
  "apm-agent-js": "js-base",
  "apm-agent-rum-js": "rum-js",
  "apm-agent-ruby": "ruby",
  "apm-agent-android": "android/java",
  "opentelemetry-java": "opentelemetry/java",
  "opentelemetry-dotnet": "opentelemetry/dotnet",
  "opentelemetry-js": "opentelemetry/nodejs",
  "opentelemetry-python": "opentelemetry/python",
  "opentelemetry-go": "opentelemetry/go",
  "opentelemetry-php": "opentelemetry/php",
  "opentelemetry-swift": "opentelemetry/swift",
  "opentelemetry-cpp": "opentelemetry/cpp",
  "opentelemetry-js": "opentelemetry/webjs",
  "opentelemetry-ruby": "opentelemetry/ruby",
  "opentelemetry-erlang": "opentelemetry/erlang",
};

const agentsRepoName = {
  java: {
    repo: "apm-agent-java",
    regex: "v(.*)",
  },
  dotnet: {
    repo: "apm-agent-dotnet",
    regex: "v(.*)",
  },
  nodejs: {
    repo: "apm-agent-nodejs",
    regex: "v(.*)",
  },
  python: {
    repo: "apm-agent-python",
    regex: "v(.*)",
  },
  go: {
    repo: "apm-agent-go",
    regex: "v(.*)",
  },
  php: {
    repo: "apm-agent-php",
    regex: "v(.*)",
  },
  "iOS/swift": {
    repo: "apm-agent-ios",
    regex: "v(.*)",
  },
  "js-base": {
    repo: "apm-agent-rum-js",
    regex: "@elastic/apm-rum@(.*)",
  },
  "rum-js": {
    repo: "apm-agent-rum-js",
    regex: "@elastic/apm-rum@(.*)",
  },
  ruby: {
    repo: "apm-agent-ruby",
    regex: "v(.*)",
  },
  "android/java": {
    repo: "apm-agent-android",
    regex: "v(.*)",
  },
  "opentelemetry/java": {
    isotel: true,
    sdk_repo: "opentelemetry-java",
    sdk_regex: "v(.*)",
    auto_repo: "opentelemetry-java-instrumentation",
    auto_regex: "v(.*)",
  },
  "opentelemetry/dotnet": {
    isotel: true,
    sdk_repo: "opentelemetry-dotnet",
    auto_repo: "opentelemetry-dotnet-instrumentation",
    sdk_regex: "Instrumentation.AspNetCore-(.*)",
    auto_regex: "v(.*)",
  },
  "opentelemetry/nodejs": {
    isotel: true,
    sdk_repo: "opentelemetry-js",
    sdk_regex: "v(.*)",
  },
  "opentelemetry/python": {
    isotel: true,
    sdk_repo: "opentelemetry-python",
    sdk_regex: "v(.*)",
  },
  "opentelemetry/ruby": {
    isotel: true,
    sdk_repo: "opentelemetry-ruby",
    sdk_regex: "opentelemetry-propagator-jaeger/v(.*)",
  },
  "opentelemetry/go": {
    isotel: true,
    sdk_repo: "opentelemetry-go",
    sdk_regex: "v(.*)",
  },
  "opentelemetry/php": {
    isotel: true,
    sdk_repo: "opentelemetry-php",
    auto_repo: "opentelemetry-php-instrumentation",
    sdk_regex: "(.*)",
    auto_regex: "(.*)",
  },
  "opentelemetry/cpp": {
    isotel: true,
    sdk_repo: "opentelemetry-cpp",
    sdk_regex: "v(.*)",
  },
  "opentelemetry/erlang": {
    isotel: true,
    sdk_repo: "opentelemetry-erlang",
    sdk_regex: "v(.*)",
  },
  "opentelemetry/swift": {
    isotel: true,
    sdk_repo: "opentelemetry-swift",
    sdk_regex: "(.*)",
  },
  "opentelemetry/webjs": {
    isotel: true,
    sdk_repo: "opentelemetry-js",
    sdk_regex: "v(.*)",
  },
};

const getAgentRepositoryDetails = (agentName) => {
  const user = agentsRepoName[agentName].isotel ? "open-telemetry" : "elastic";
  const repository =
    user === "open-telemetry"
      ? agentsRepoName[agentName].sdk_repo
      : agentsRepoName[agentName].repo;

  if (!repository) {
    return undefined;
  }

  return { user, repository };
};

const extractLastVersion = (agentInfo) => {
  const agentName = mappingNames[agentInfo.name];
  const isOtel = agentsRepoName[agentName]?.isotel;

  const regexPattern = isOtel
    ? agentsRepoName[agentName]?.sdk_regex
    : agentsRepoName[agentName]?.regex;
  const regex = new RegExp(regexPattern);
  const value = agentInfo.releases.nodes?.[0]?.tagName;
  const regexMatch = value.match(regex);

  return {
    [agentName]: {
      ...(isOtel
        ? {
            sdk_latest_version: regexMatch?.[1],
            auto_latest_version: regexMatch?.[1],
          }
        : { latest_version: regexMatch?.[1] }),
    },
  };
};

const fetchAgentsInfo = async (query) => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    body: JSON.stringify({ query }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const releases = (await response.json())?.data;
  const versions = Object.values(releases).reduce((acc, curr) => {
    return {
      ...acc,
      ...extractLastVersion(curr),
    };
  }, {});

  return versions;
};

const generateQuery = (agentName, index) => {
  const repositoryDetails = getAgentRepositoryDetails(agentName);

  return `
    repo${index}: repository(owner: "${repositoryDetails?.user}", name: "${repositoryDetails?.repository}") {
      name
      releases(first: 1) {
        nodes {
          tagName
        }
      }
    }
  `;
};

const uploadFile = async (data) => {
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  return await bucket.file(filename).save(JSON.stringify(data));
};

/**
 * Triggered from a message on a Cloud Pub/Sub topic.
 *
 * @param {!Object} event Event payload.
 * @param {!Object} context Metadata for the event.
 */
exports.helloPubSub = async (event, context) => {
  const agentsQueries = Object.keys(agentsRepoName).map((agent, index) =>
    generateQuery(agent, index)
  );

  const query = `
    query {
      ${agentsQueries.join('\n')}
    }
  `;

  const versions = await fetchAgentsInfo(query);

  await uploadFile(versions);
};
