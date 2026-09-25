---
title: System overview
sidebar_position: 1
description: How the OfficeHQ telephony system fits together, and what each of its four repositories is responsible for.
---

# System overview

OfficeHQ runs a telephony platform for a call-answering business that sells through resellers. Clients sign up for a receptionist service. They configure how their calls are handled, and OfficeHQ agents answer those calls on their behalf.

The platform is made up of four systems, each kept in its own repository:

| System | Repository id | Role in one line |
|--------|---------------|------------------|
| OFIS | `ofis` | Legacy billing and client-management platform used by staff |
| Client Portal | `client-portal-v2` | Self-service portal where clients manage their own settings |
| Contact Centre | `contact-centre` | Backend that makes live call-routing decisions |
| QConnect | `qconnect` | Agent-facing user interface built on Twilio Flex |

## Key terms

| Term | Meaning |
|------|---------|
| Reseller | A business that resells the answering service. OFIS is multi-tenant: each active reseller has its own database. |
| Client | A customer of OfficeHQ or of a reseller, whose calls are answered by the service. |
| Call plan | Part of a client's call-handling configuration. Clients manage it in Client Portal, together with company information and greetings. |
| OFIS | The legacy internal platform for reseller, client, and billing data. |
| CPv2 / CPv3 | The two web frontends of Client Portal. CPv2 is the current production frontend. CPv3 is a rebuild that is being rolled out gradually behind a feature flag. |
| QConnect | The Twilio Flex user interface that agents use to handle calls. |
| Twilio / Twilio Flex | The telephony provider. Twilio places and carries calls. Twilio Flex is its contact-centre application, and TaskRouter is the Twilio service that routes work to agents. |
| CDC | Change data capture: streaming row-level database changes as events. |

## How the parts fit together

Configuration is edited in the two legacy systems. It is copied into Contact Centre's own databases ahead of time, so the live call path never depends on the legacy databases.

![OFIS and Client Portal write to the legacy databases. A Debezium CDC pipeline, or direct polling, feeds Contact Centre's Data Sync Service. That service writes PostgreSQL databases, which the Routing API reads when Twilio asks how to route a call and which QConnect queries over GraphQL.](./img/system-architecture.svg)

*Figure 1. OfficeHQ telephony system architecture. Source: `publics/diagrams/overview/system-architecture.html`.*

1. **Configuration is edited in the systems of record.** Staff use OFIS to manage resellers, clients, and billing. Clients use Client Portal to manage company information, greetings, and call plans. Both applications write to the legacy relational databases (SQL Server and MySQL/MariaDB).
2. **Changes are captured.** Debezium reads each legacy database's native change log (SQL Server CDC and the MySQL binlog). It publishes every row change to an Amazon SNS topic. SNS delivers a copy to an Amazon SQS FIFO queue, grouped by client, and another copy to an Amazon S3 archive. Engineers can query the archive with Amazon Athena to trace what changed and when.
3. **Changes are synchronised.** Contact Centre's Data Sync Service consumes the queue, or in an alternative mode polls the legacy databases directly. Per-entity transforms convert each change and write the result into Contact Centre's PostgreSQL databases: the **Routing** database and the **Answering** database.
4. **A call is routed.** When a call arrives, Twilio calls Contact Centre's Routing API (`twiml` and `resolveActiveService` endpoints). The API decides how to handle the call from what was last synced into the Routing database. It does not query OFIS or Client Portal on the call path.
5. **An agent handles the call.** Twilio Flex and TaskRouter deliver the call to an agent in QConnect. QConnect reads the client's answering configuration, such as the greeting, company information, and call-script settings, through a GraphQL API over the Answering database.
6. **What happened is recorded.** Twilio sends call, conference, recording, and TaskRouter status callbacks to Contact Centre's Event Tracking service. The service stores them for call history, billing, and reporting. Event Tracking is not shown in Figure 1.

## Repositories

### OFIS (`ofis`)

| | |
|---|---|
| **Purpose** | Multi-tenant billing and client-management platform for the answering-service reseller business. Used by internal staff. |
| **Source of truth for** | Reseller, client, and billing data. |
| **Stack** | ASP.NET MVC 5 on .NET Framework 4.8, NHibernate (FluentNHibernate), MySQL, SQL Server. Runs as Windows containers on AWS. |

Key components:

| Component | What it does |
|-----------|--------------|
| `OFIS` web app | The main MVC application: controllers, views, and dependency injection (Autofac). |
| `FluentNHibernateLibrary` | Data layer: NHibernate session management, entity mappings, and a repository facade. |
| `InvoiceLibrary` and `InvoiceApp` | Invoice generation and payment gateway integrations. `InvoiceApp` is a console application that runs batch invoicing as a scheduled task. |
| `TwilioServices` and `CustomAudioServices` | Twilio Flex queue and asset management, text-to-speech, and audio conversion. |
| `SendGridLibrary` and `UtilityLibrary` | Email delivery and shared helpers. |

OFIS uses one shared MySQL database for reseller metadata, one MySQL database per active reseller, and a shared SQL Server database. For each request it selects the database of the reseller that owns the client. Staff sign in through AWS Cognito.

### Client Portal (`client-portal-v2`)

| | |
|---|---|
| **Purpose** | Customer self-service: clients view and change their own receptionist and call-handling settings, invoices, and payments. |
| **Source of truth for** | Client-configured settings: company information, greetings, and call plans. |
| **Stack** | .NET 9 (ASP.NET Core Web API, EF Core), React frontends, SQL Server and MariaDB, AWS Cognito for authentication. |

The repository holds several systems that are deployed independently:

| Component | What it does |
|-----------|--------------|
| Client Portal API (`src/api`) | The main backend, organised by feature folders (clients, invoices, payments, support, and so on). One class library per business capability. EF Core contexts for the legacy SQL Server and MariaDB databases. |
| CPv2 frontend (`src/ui`) | The current production frontend (React 18, Ant Design). |
| CPv3 frontend (`src/uiv3`) | A rebuild (React 19, Tailwind) that talks to the same backend. It is rolled out gradually behind a feature flag and served from the same origin as CPv2. |
| Notifications (`src/notifications`) | A notifications pipeline with its own AWS Lambda host and a document database. |
| Zapier integration (`src/zapier`) | A standalone Zapier service (OAuth and webhooks). The main API calls it over HTTP. |

### Contact Centre (`contact-centre`)

| | |
|---|---|
| **Purpose** | Modern backend that serves live calls: it decides how each call is routed and records what happens on every call. |
| **Source of truth for** | Live call-routing decisions and call event history. Configuration still comes from OFIS and Client Portal and is synchronised in. |
| **Stack** | .NET 9, PostgreSQL, Twilio, Debezium, AWS (SNS, SQS, S3). Hasura provides the GraphQL layer over the Answering database. |

Each folder under `src/` is an independent service or library:

| Component | What it does |
|-----------|--------------|
| Routing (`src/Routing`) | The Routing API that Twilio calls for each incoming call (`twiml`, `resolveActiveService`). It is hosted as an Azure Function and reads the Routing database. |
| Compatibility (`src/Compatibility`) | The bridge between legacy and new data. `DataSync` consumes CDC events from SQS, or polls the legacy databases, and writes to the Routing and Answering databases. It has an admin UI for inspecting and queuing syncs. `RecordingSync` moves call recordings and voicemail between Twilio and legacy storage. |
| Answering (`src/Answering`) | Persistence for the Answering database: company information, greetings, FAQs, and schedules. |
| Configuration (`src/Configuration`) | Persistence for supervisor-facing configuration such as announcements, canned responses, and supervisor messages. |
| Event Tracking (`src/EventTracking`) | An API that receives Twilio call, conference, recording, and TaskRouter callbacks, and a worker that processes and stores them. |
| Authentication (`src/Authentication`) | A shared API key authentication scheme used by the APIs. |

### QConnect (`qconnect`)

| | |
|---|---|
| **Purpose** | The user interface agents and supervisors use to handle calls. It is a customised fork of Twilio's Flex Project Template. |
| **Source of truth for** | The agent experience in Twilio Flex. It does not access the other systems' databases directly. It works through Twilio Flex and TaskRouter, its own serverless functions, and backend APIs such as Contact Centre's Answering GraphQL API. |
| **Stack** | React 17, Twilio Flex UI 2.x, Twilio Serverless functions, TypeScript. |

| Component | What it does |
|-----------|--------------|
| Flex plugin (`flex-template-plugin-qconnect`) | A single Flex 2.0 plugin built from a feature library. Each feature is self-contained and can be switched on or off in configuration. OfficeHQ features include the call canvas, call scripts, calls in queue, transfer directory, outbound dialler, and supervisor tools. Template features include callbacks and voicemail, dispositions, and internal calls. |
| Serverless functions (`serverless-functions`) | Twilio Serverless backend functions used by plugin features. |
| Flex configuration (`flex-config`) | Scripts and per-environment files that deploy Flex UI attributes (including feature settings) and TaskRouter skills. |
| QConnect API feature | Clients for backend APIs: the Answering GraphQL API (answering configuration, canned responses, contacts), plus messaging, call-scripting, and helpdesk APIs. |

QConnect replaced the earlier Flex 1.0 plugins. Those plugins used to live in the Contact Centre repository and have since been archived.

## Design points worth knowing

- **Legacy systems stay authoritative.** OFIS and Client Portal remain where data is edited. Contact Centre holds a synchronised copy that is optimised for serving calls.
- **The call path is isolated.** The Routing API reads only from PostgreSQL, so an outage or slow query in a legacy database does not block call routing. The trade-off is that a call sees whatever was last synchronised.
- **Every change is replayable.** Because each CDC event is archived in S3, synchronisation problems can be investigated independently of the current database state.

## Related pages

- [Getting started](../onboarding/getting-started.md)
