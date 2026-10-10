# Person C contract examples — development only

**Status:** synthetic interface examples for C-00 discussion. These are not reserved evaluation inputs/gold answers, runtime schema files or proof that A/B adopted the proposal. Actual shared types, exact money representation and response envelopes are chosen by A.

## 1. Clean extraction

Illustrative context supplied by A (authorized image input omitted):

    {
      "requestId": "dev-ocr-001",
      "source": {"id": "doc_dev_001", "version": "1", "contentHash": "synthetic-a"},
      "versions": {"modelId": "<configured-vision-model>", "prompt": "receipt-v1", "schema": "document-fields-v1"}
    }

Illustrative C proposal:

    {
      "status": "proposed",
      "sourceId": "doc_dev_001",
      "sourceVersion": "1",
      "fields": {
        "merchant": {
          "rawText": "Northstar Workspace",
          "normalizedValue": "Northstar Workspace",
          "state": "observed",
          "evidenceField": "merchant",
          "issues": []
        },
        "documentDate": {
          "rawText": "8 Oct 2026",
          "normalizedValue": "2026-10-08",
          "state": "observed",
          "evidenceField": "document_date",
          "issues": []
        },
        "total": {
          "rawText": "PKR 4,500.00",
          "normalizedValue": "450000",
          "state": "observed",
          "evidenceField": "total",
          "issues": []
        },
        "currency": {
          "rawText": "PKR",
          "normalizedValue": "PKR",
          "state": "observed",
          "evidenceField": "currency",
          "issues": []
        },
        "reference": {
          "rawText": "NW-104",
          "normalizedValue": "NW-104",
          "state": "observed",
          "evidenceField": "reference",
          "issues": []
        }
      },
      "blockers": [],
      "origin": "live",
      "versions": {
        "modelId": "<configured-vision-model>",
        "prompt": "receipt-v1",
        "schema": "document-fields-v1"
      }
    }

The value 450000 is only an illustration of the proposed minor-unit string convention (PKR 4,500.00); A may choose another exact representation. This does not settle which fields are required before the owner can mark a document reviewed.

## 2. Missing or unreadable total

    {
      "status": "needs_review",
      "sourceId": "doc_dev_002",
      "fields": {
        "total": {"rawText": null, "normalizedValue": null, "state": "unreadable", "issues": ["unreadable_field"], "evidenceField": "total"},
        "currency": {"rawText": "PKR", "normalizedValue": "PKR", "state": "observed", "issues": [], "evidenceField": "currency"}
      },
      "blockers": ["total_requires_review"]
    }

The amount is null, never zero. The source remains viewable; no new cash transaction is created.

## 3. Equal-value candidates remain ambiguous

Given a reviewed PKR 4,500 document and two distinct imported transactions with the same amount, no reference and weak descriptions:

    {
      "status": "needs_review",
      "reason": "multiple_candidates",
      "documentId": "doc_dev_001",
      "documentVersion": "2",
      "candidateSnapshot": "snapshot-dev-01",
      "candidates": [
        {"transactionId": "txn_dev_031", "amountMatches": true, "currencyMatches": true, "dateGapDays": 1, "referenceState": "missing", "supportingEvidence": []},
        {"transactionId": "txn_dev_044", "amountMatches": true, "currencyMatches": true, "dateGapDays": 2, "referenceState": "missing", "supportingEvidence": []}
      ],
      "recommendationId": null
    }

Neither candidate is confirmed. A owns any eventual approval and unique allocation.

## 4. Read-only tool call has no owner argument

Example proposed call to the PRD tool:

    {"name":"get_review_queue","arguments":{"kind":"unmatched_outflows","cursor":null,"limit":20}}

There is deliberately no workspaceId, SQL, URL, path, approval or update action. A closes over the verified workspace and authorizes every record. C validates tool name and arguments before dispatch. Exact fields remain pending A's schema.

Synthetic result:

    {
      "snapshot": "snapshot-dev-01",
      "scope": {"kind": "unmatched_outflows", "period": "2026-10"},
      "records": [{"transactionId":"txn_dev_044","version":"1","sourceId":"csv_dev_01","sourceRow":7,"matchStatus":"unmatched","reviewReason":"No accepted supporting document"}],
      "returnedCount": 1,
      "totalCount": 1,
      "complete": true,
      "nextCursor": null
    }

“Unmatched” applies only to this imported row and scope. It does not prove fraud, nonpayment or the absence of evidence outside this dataset.

## 5. Assistant selects a deterministic fact

Assume A's tool registered a synthetic fact: fact_dev_01 maps to an exact PKR amount, query period 2026-10 and snapshot-dev-01. The model selects the fact ID; code renders the value.

    {
      "status": "answered",
      "scope": {"period":"2026-10","snapshot":"snapshot-dev-01"},
      "blocks": [
        {"kind":"fact","factId":"fact_dev_01","templateId":"outflow_total"},
        {"kind":"notice","templateId":"pending_matches_are_not_confirmed"},
        {"kind":"records","headingId":"outflows_needing_evidence","recordIds":["txn_dev_044"]}
      ],
      "evidence": [{"sourceId":"csv_dev_01","recordId":"txn_dev_044","kind":"csv","row":7}],
      "trace": [
        {"tool":"get_cash_summary","status":"complete","factIds":["fact_dev_01"]},
        {"tool":"get_review_queue","status":"complete","recordIds":["txn_dev_044"]}
      ]
    }

App code renders values and resolves references. Do not display inaccessible evidence, generated private URLs, or arbitrary model-written figures.

## 6. Failure, cached result and stale source

Provider timeout is a failure outcome, not an empty extraction:

    {
      "status":"failed",
      "error":{"code":"provider_timeout","retryable":true},
      "recovery":{"action":"retry_when_available"},
      "sourceId":"doc_dev_003"
    }

Existing-book preservation must be checked through A's actual persistence flow; this response example alone cannot establish it.

A completed cache hit can reuse extracted proposals only when owner/source/model/prompt/schema identity matches; report origin as cached. It must not overwrite reviewed corrections. A changed source/version or stale completion is nonactionable and requires a current proposal.

Illustrative cached outcome (same complete extraction shape and values as the live proposal; only origin changes):

    {
      "status": "proposed",
      "sourceId": "doc_dev_001",
      "sourceVersion": "1",
      "fields": {
        "merchant": {
          "rawText": "Northstar Workspace",
          "normalizedValue": "Northstar Workspace",
          "state": "observed",
          "evidenceField": "merchant",
          "issues": []
        },
        "documentDate": {
          "rawText": "8 Oct 2026",
          "normalizedValue": "2026-10-08",
          "state": "observed",
          "evidenceField": "document_date",
          "issues": []
        },
        "total": {
          "rawText": "PKR 4,500.00",
          "normalizedValue": "450000",
          "state": "observed",
          "evidenceField": "total",
          "issues": []
        },
        "currency": {
          "rawText": "PKR",
          "normalizedValue": "PKR",
          "state": "observed",
          "evidenceField": "currency",
          "issues": []
        },
        "reference": {
          "rawText": "NW-104",
          "normalizedValue": "NW-104",
          "state": "observed",
          "evidenceField": "reference",
          "issues": []
        }
      },
      "blockers": [],
      "origin": "cached",
      "versions": {
        "modelId": "<configured-vision-model>",
        "prompt": "receipt-v1",
        "schema": "document-fields-v1"
      }
    }

Illustrative stale completion after the source was corrected/version advanced:

    {
      "status": "needs_review",
      "reason": "stale_input",
      "sourceId": "doc_dev_001",
      "resultInputVersion": "1",
      "currentInputVersion": "2",
      "action": "refresh_from_current_source"
    }

These field names are illustrative; A's operation and review schemas decide the actual envelope. A stale result must not replace current extraction, owner corrections or accepted decisions.

## Agreement needed before implementation

A confirms actual schema field names/imports, exact money value, state/error enums, tool input/results, source locators, durable operation/cache interface and snapshot checks. A/B confirm required review fields and which examples they need B's screens to render. Until that happens, use these as discussion/development examples only. They contain no reserved gold labels and are not production fixtures.
