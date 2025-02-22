/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { EuiHealth, EuiText } from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import type { Severity } from '@kbn/securitysolution-io-ts-alerting-types';
import { capitalize } from 'lodash';
import { ALERT_SEVERITY } from '@kbn/rule-data-utils';
import { DefaultDraggable } from '../../../../common/components/draggables';
import { SEVERITY_COLOR } from '../../../../overview/components/detection_response/utils';
import { FormattedCount } from '../../../../common/components/formatted_number';
import * as i18n from './translations';

interface SeverityTableItem {
  key: Severity;
  value: number;
  label: string;
}

export const getSeverityTableColumns = (): Array<EuiBasicTableColumn<SeverityTableItem>> => [
  {
    field: 'key',
    name: i18n.SEVERITY_LEVEL_COLUMN_TITLE,
    'data-test-subj': 'severityTable-severity',
    render: (severity: Severity) => (
      <EuiHealth color={SEVERITY_COLOR[severity]} textSize="xs">
        <DefaultDraggable
          isDraggable={false}
          field={ALERT_SEVERITY}
          hideTopN
          id={`alert-severity-draggable-${severity}`}
          value={capitalize(severity)}
          queryValue={severity}
          tooltipContent={null}
        />
      </EuiHealth>
    ),
  },
  {
    field: 'value',
    name: i18n.SEVERITY_COUNT_COULMN_TITLE,
    sortable: true,
    dataType: 'number',
    'data-test-subj': 'severityTable-alertCount',
    render: (alertCount: number) => (
      <EuiText grow={false} size="xs">
        <FormattedCount count={alertCount} />
      </EuiText>
    ),
  },
];
