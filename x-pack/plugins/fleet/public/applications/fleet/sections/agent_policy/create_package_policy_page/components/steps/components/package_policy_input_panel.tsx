/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, Fragment, memo, useMemo } from 'react';
import styled from 'styled-components';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiSwitch,
  EuiText,
  EuiHorizontalRule,
  EuiSpacer,
  EuiButtonEmpty,
} from '@elastic/eui';

import { getRegistryDataStreamAssetBaseName } from '../../../../../../../../../common/services';
import type {
  NewPackagePolicy,
  NewPackagePolicyInput,
  PackageInfo,
  PackagePolicyInputStream,
  RegistryInput,
  RegistryStream,
  RegistryStreamWithDataStream,
} from '../../../../../../types';
import type { PackagePolicyInputValidationResults } from '../../../services';
import { hasInvalidButRequiredVar, countValidationErrors } from '../../../services';

import { PackagePolicyInputConfig } from './package_policy_input_config';
import { PackagePolicyInputStreamConfig } from './package_policy_input_stream';
import { useDataStreamId } from './hooks';

const ShortenedHorizontalRule = styled(EuiHorizontalRule)`
  &&& {
    width: ${(11 / 12) * 100}%;
    margin-left: auto;
  }
`;

export const shouldShowStreamsByDefault = (
  packageInput: RegistryInput,
  packageInputStreams: Array<RegistryStream & { data_stream: { dataset: string; type: string } }>,
  packagePolicyInput: NewPackagePolicyInput,
  defaultDataStreamId?: string
): boolean => {
  if (!packagePolicyInput.enabled) {
    return false;
  }

  return (
    hasInvalidButRequiredVar(packageInput.vars, packagePolicyInput.vars) ||
    packageInputStreams.some(
      (stream) =>
        stream.enabled &&
        hasInvalidButRequiredVar(
          stream.vars,
          packagePolicyInput.streams.find(
            (pkgStream) => stream.data_stream.dataset === pkgStream.data_stream.dataset
          )?.vars
        )
    ) ||
    packagePolicyInput.streams.some((stream) => {
      return defaultDataStreamId && stream.id && stream.id === defaultDataStreamId;
    })
  );
};

export const PackagePolicyInputPanel: React.FunctionComponent<{
  packageInput: RegistryInput;
  packageInfo: PackageInfo;
  packagePolicy: NewPackagePolicy;
  packageInputStreams: RegistryStreamWithDataStream[];
  packagePolicyInput: NewPackagePolicyInput;
  updatePackagePolicy: (updatedPackagePolicy: Partial<NewPackagePolicy>) => void;
  updatePackagePolicyInput: (updatedInput: Partial<NewPackagePolicyInput>) => void;
  inputValidationResults: PackagePolicyInputValidationResults;
  forceShowErrors?: boolean;
}> = memo(
  ({
    packageInput,
    packageInfo,
    packageInputStreams,
    packagePolicyInput,
    packagePolicy,
    updatePackagePolicy,
    updatePackagePolicyInput,
    inputValidationResults,
    forceShowErrors,
  }) => {
    const defaultDataStreamId = useDataStreamId();
    // Showing streams toggle state
    const [isShowingStreams, setIsShowingStreams] = useState<boolean>(() =>
      shouldShowStreamsByDefault(
        packageInput,
        packageInputStreams,
        packagePolicyInput,
        defaultDataStreamId
      )
    );

    // Errors state
    const errorCount = inputValidationResults && countValidationErrors(inputValidationResults);
    const hasErrors = forceShowErrors && errorCount;

    const hasInputStreams = useMemo(
      () => packageInputStreams.length > 0,
      [packageInputStreams.length]
    );
    const inputStreams = useMemo(
      () =>
        packageInputStreams
          .map((packageInputStream) => {
            return {
              packageInputStream,
              packagePolicyInputStream: packagePolicyInput.streams.find(
                (stream) => stream.data_stream.dataset === packageInputStream.data_stream.dataset
              ),
            };
          })
          .filter((stream) => Boolean(stream.packagePolicyInputStream)),
      [packageInputStreams, packagePolicyInput.streams]
    );

    // setting Indexing setting: TSDB to enabled by default, if the data stream's index_mode is set to time_series
    let isUpdated = false;
    inputStreams.forEach(({ packagePolicyInputStream }) => {
      const dataStreamInfo = packageInfo.data_streams?.find(
        (ds) => ds.dataset === packagePolicyInputStream?.data_stream.dataset
      );

      if (dataStreamInfo?.elasticsearch?.index_mode === 'time_series') {
        if (!packagePolicy.package) return;
        if (!packagePolicy.package?.experimental_data_stream_features)
          packagePolicy.package!.experimental_data_stream_features = [];

        const dsName = getRegistryDataStreamAssetBaseName(packagePolicyInputStream!.data_stream);
        const match = packagePolicy.package!.experimental_data_stream_features.find(
          (feat) => feat.data_stream === dsName
        );
        if (match) {
          if (!match.features.tsdb) {
            match.features.tsdb = true;
            isUpdated = true;
          }
        } else {
          packagePolicy.package!.experimental_data_stream_features.push({
            data_stream: dsName,
            features: { tsdb: true, synthetic_source: false },
          });
          isUpdated = true;
        }
      }
    });

    if (isUpdated) {
      updatePackagePolicy(packagePolicy);
    }

    return (
      <>
        {/* Header / input-level toggle */}
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiSwitch
              label={
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiText>
                      <h4>{packageInput.title || packageInput.type}</h4>
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
              checked={packagePolicyInput.enabled}
              disabled={packagePolicyInput.keep_enabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                updatePackagePolicyInput({
                  enabled,
                  streams: packagePolicyInput.streams.map((stream) => ({
                    ...stream,
                    enabled,
                  })),
                });
                if (!enabled && isShowingStreams) {
                  setIsShowingStreams(false);
                }
              }}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" alignItems="center">
              {hasErrors ? (
                <EuiFlexItem grow={false}>
                  <EuiText color="danger" size="s">
                    <FormattedMessage
                      id="xpack.fleet.createPackagePolicy.stepConfigure.errorCountText"
                      defaultMessage="{count, plural, one {# error} other {# errors}}"
                      values={{ count: errorCount }}
                    />
                  </EuiText>
                </EuiFlexItem>
              ) : null}
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  color={hasErrors ? 'danger' : 'primary'}
                  onClick={() => setIsShowingStreams(!isShowingStreams)}
                  iconType={isShowingStreams ? 'arrowUp' : 'arrowDown'}
                  iconSide="right"
                  aria-label={
                    isShowingStreams
                      ? i18n.translate(
                          'xpack.fleet.createPackagePolicy.stepConfigure.hideStreamsAriaLabel',
                          {
                            defaultMessage: 'Hide {type} inputs',
                            values: {
                              type: packageInput.type,
                            },
                          }
                        )
                      : i18n.translate(
                          'xpack.fleet.createPackagePolicy.stepConfigure.showStreamsAriaLabel',
                          {
                            defaultMessage: 'Show {type} inputs',
                            values: {
                              type: packageInput.type,
                            },
                          }
                        )
                  }
                >
                  {
                    <FormattedMessage
                      id="xpack.fleet.createPackagePolicy.stepConfigure.expandLabel"
                      defaultMessage="Change defaults"
                    />
                  }
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>

        {/* Header rule break */}
        {isShowingStreams ? <EuiSpacer size="l" /> : null}

        {/* Input level policy */}
        {isShowingStreams && packageInput.vars && packageInput.vars.length ? (
          <Fragment>
            <PackagePolicyInputConfig
              hasInputStreams={hasInputStreams}
              packageInputVars={packageInput.vars}
              packagePolicyInput={packagePolicyInput}
              updatePackagePolicyInput={updatePackagePolicyInput}
              inputVarsValidationResults={{ vars: inputValidationResults?.vars }}
              forceShowErrors={forceShowErrors}
            />
            {hasInputStreams ? <ShortenedHorizontalRule margin="m" /> : <EuiSpacer size="l" />}
          </Fragment>
        ) : null}

        {/* Per-stream policy */}
        {isShowingStreams ? (
          <EuiFlexGroup direction="column">
            {inputStreams.map(({ packageInputStream, packagePolicyInputStream }, index) => (
              <EuiFlexItem key={index}>
                <PackagePolicyInputStreamConfig
                  packageInfo={packageInfo}
                  packagePolicy={packagePolicy}
                  packageInputStream={packageInputStream}
                  packagePolicyInputStream={packagePolicyInputStream!}
                  updatePackagePolicy={updatePackagePolicy}
                  updatePackagePolicyInputStream={(
                    updatedStream: Partial<PackagePolicyInputStream>
                  ) => {
                    const indexOfUpdatedStream = packagePolicyInput.streams.findIndex(
                      (stream) =>
                        stream.data_stream.dataset === packageInputStream.data_stream.dataset
                    );
                    const newStreams = [...packagePolicyInput.streams];
                    newStreams[indexOfUpdatedStream] = {
                      ...newStreams[indexOfUpdatedStream],
                      ...updatedStream,
                    };

                    const updatedInput: Partial<NewPackagePolicyInput> = {
                      streams: newStreams,
                    };

                    // Update input enabled state if needed
                    if (!packagePolicyInput.enabled && updatedStream.enabled) {
                      updatedInput.enabled = true;
                    } else if (
                      packagePolicyInput.enabled &&
                      !newStreams.find((stream) => stream.enabled)
                    ) {
                      updatedInput.enabled = false;
                    }

                    updatePackagePolicyInput(updatedInput);
                  }}
                  inputStreamValidationResults={
                    inputValidationResults?.streams![packagePolicyInputStream!.data_stream!.dataset]
                  }
                  forceShowErrors={forceShowErrors}
                />
                {index !== inputStreams.length - 1 ? (
                  <>
                    <EuiSpacer size="m" />
                    <ShortenedHorizontalRule margin="none" />
                  </>
                ) : null}
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        ) : null}
      </>
    );
  }
);
