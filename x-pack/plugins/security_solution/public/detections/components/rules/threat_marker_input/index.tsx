/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import { Field, getUseField } from '../../../../shared_imports';
import type { DefineStepRule } from '../../../pages/detection_engine/rules/types';
import { schema } from '../step_define_rule/schema';
import * as i18n from '../step_define_rule/translations';
import { MyLabelButton } from '../step_define_rule';

const CommonUseField = getUseField({ component: Field });

interface ThreatMarkerInputProps {
  threatIndexModified: boolean;
  handleResetThreatIndices: () => void;
}

const ThreatMarkerInputComponent: React.FC<ThreatMarkerInputProps> = ({
  threatIndexModified,
  handleResetThreatIndices,
}: ThreatMarkerInputProps) => {
  return (
    <>
      <EuiSpacer size="m" />
      <EuiFlexGroup direction="column">
        <EuiFlexItem grow={true}>
          <CommonUseField<string[], DefineStepRule>
            path="threatIndex"
            config={{
              ...schema.threatIndex,
              labelAppend: threatIndexModified ? (
                <MyLabelButton onClick={handleResetThreatIndices} iconType="refresh">
                  {i18n.RESET_DEFAULT_INDEX}
                </MyLabelButton>
              ) : null,
            }}
            componentProps={{
              idAria: 'detectionEngineStepDefineRuleThreatMatchIndices',
              'data-test-subj': 'detectionEngineStepDefineRuleThreatMatchIndices',
              euiFieldProps: {
                fullWidth: true,
                isDisabled: false,
                placeholder: '',
              },
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
    </>
  );
};

export const ThreatMarkerInput = React.memo(ThreatMarkerInputComponent);
