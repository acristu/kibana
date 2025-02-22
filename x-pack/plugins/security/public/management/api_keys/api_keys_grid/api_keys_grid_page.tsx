/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiBasicTableColumn, EuiInMemoryTableProps } from '@elastic/eui';
import {
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { History } from 'history';
import moment from 'moment-timezone';
import React, { Component } from 'react';
import { Route } from 'react-router-dom';

import type { NotificationsStart } from '@kbn/core/public';
import { SectionLoading } from '@kbn/es-ui-shared-plugin/public';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { reactRouterNavigate } from '@kbn/kibana-react-plugin/public';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import type { PublicMethodsOf } from '@kbn/utility-types';

import type { ApiKey, ApiKeyToInvalidate } from '../../../../common/model';
import { Breadcrumb } from '../../../components/breadcrumb';
import { SelectableTokenField } from '../../../components/token_field';
import type {
  APIKeysAPIClient,
  CreateApiKeyResponse,
  UpdateApiKeyResponse,
} from '../api_keys_api_client';
import { ApiKeyFlyout } from './api_key_flyout';
import { ApiKeysEmptyPrompt } from './api_keys_empty_prompt';
import type { InvalidateApiKeys } from './invalidate_provider';
import { InvalidateProvider } from './invalidate_provider';
import { NotEnabled } from './not_enabled';
import { PermissionDenied } from './permission_denied';

interface Props {
  history: History;
  notifications: NotificationsStart;
  apiKeysAPIClient: PublicMethodsOf<APIKeysAPIClient>;
  readOnly?: boolean;
}

interface State {
  isLoadingApp: boolean;
  isLoadingTable: boolean;
  isAdmin: boolean;
  canManage: boolean;
  areApiKeysEnabled: boolean;
  apiKeys?: ApiKey[];
  selectedItems: ApiKey[];
  error: any;
  createdApiKey?: CreateApiKeyResponse;
  selectedApiKey?: ApiKey;
  isUpdateFlyoutVisible: boolean;
}

const DATE_FORMAT = 'MMMM Do YYYY HH:mm:ss';

export class APIKeysGridPage extends Component<Props, State> {
  static defaultProps: Partial<Props> = {
    readOnly: false,
  };

  constructor(props: any) {
    super(props);
    this.state = {
      isLoadingApp: true,
      isLoadingTable: false,
      isAdmin: false,
      canManage: false,
      areApiKeysEnabled: false,
      apiKeys: undefined,
      selectedItems: [],
      error: undefined,
      selectedApiKey: undefined,
      isUpdateFlyoutVisible: false,
    };
  }

  public componentDidMount() {
    this.checkPrivileges();
  }

  public render() {
    return (
      // Flyout to create new ApiKey
      <>
        <Route path="/create">
          <Breadcrumb
            text={i18n.translate('xpack.security.management.apiKeys.createBreadcrumb', {
              defaultMessage: 'Create',
            })}
            href="/create"
          >
            <ApiKeyFlyout
              onSuccess={(createApiKeyResponse) => {
                this.props.history.push({ pathname: '/' });

                this.reloadApiKeys();

                this.setState({
                  createdApiKey: createApiKeyResponse,
                });
              }}
              onCancel={() => {
                this.props.history.push({ pathname: '/' });
                this.setState({ selectedApiKey: undefined });
              }}
            />
          </Breadcrumb>
        </Route>

        {
          // Flyout to update or view ApiKey
          this.state.isUpdateFlyoutVisible && (
            <ApiKeyFlyout
              onSuccess={(createApiKeyResponse, updateApiKeyResponse) => {
                this.reloadApiKeys();
                this.displayUpdatedApiKeyToast(updateApiKeyResponse);
                this.setState({
                  selectedApiKey: undefined,
                  isUpdateFlyoutVisible: false,
                });
              }}
              onCancel={() => {
                this.setState({ selectedApiKey: undefined, isUpdateFlyoutVisible: false });
              }}
              apiKey={this.state.selectedApiKey}
              readonly={this.props.readOnly}
            />
          )
        }
        {this.renderContent()}
      </>
    );
  }

  public renderContent() {
    const { isLoadingApp, isLoadingTable, areApiKeysEnabled, isAdmin, canManage, error, apiKeys } =
      this.state;

    if (!apiKeys) {
      if (isLoadingApp) {
        return (
          <SectionLoading>
            <FormattedMessage
              id="xpack.security.management.apiKeys.table.loadingApiKeysDescription"
              defaultMessage="Loading API keys…"
            />
          </SectionLoading>
        );
      }

      if (!canManage) {
        return <PermissionDenied />;
      }

      if (error) {
        return (
          <ApiKeysEmptyPrompt error={error}>
            <EuiButton iconType="refresh" onClick={this.reloadApiKeys}>
              <FormattedMessage
                id="xpack.security.accountManagement.apiKeys.retryButton"
                defaultMessage="Try again"
              />
            </EuiButton>
          </ApiKeysEmptyPrompt>
        );
      }

      if (!areApiKeysEnabled) {
        return <NotEnabled />;
      }
    }

    if (!isLoadingTable && apiKeys && apiKeys.length === 0) {
      if (this.props.readOnly) {
        return <ApiKeysEmptyPrompt readOnly={this.props.readOnly} />;
      } else {
        return (
          <ApiKeysEmptyPrompt>
            <EuiButton
              {...reactRouterNavigate(this.props.history, '/create')}
              fill
              iconType="plusInCircleFilled"
              data-test-subj="apiKeysCreatePromptButton"
              href={'/'}
            >
              <FormattedMessage
                id="xpack.security.management.apiKeys.table.createButton"
                defaultMessage="Create API key"
              />
            </EuiButton>
          </ApiKeysEmptyPrompt>
        );
      }
    }

    const concatenated = `${this.state.createdApiKey?.id}:${this.state.createdApiKey?.api_key}`;

    const description = this.determineDescription(isAdmin, this.props.readOnly ?? false);

    return (
      <>
        <KibanaPageTemplate.Header
          paddingSize="none"
          bottomBorder
          pageTitle={
            <FormattedMessage
              id="xpack.security.management.apiKeys.table.apiKeysTitle"
              defaultMessage="API Keys"
            />
          }
          description={description}
          rightSideItems={
            this.props.readOnly
              ? undefined
              : [
                  <EuiButton
                    {...reactRouterNavigate(this.props.history, '/create')}
                    fill
                    iconType="plusInCircleFilled"
                    data-test-subj="apiKeysCreateTableButton"
                  >
                    <FormattedMessage
                      id="xpack.security.management.apiKeys.table.createButton"
                      defaultMessage="Create API key"
                    />
                  </EuiButton>,
                ]
          }
        />

        {this.state.createdApiKey && !this.state.isLoadingTable && (
          <>
            <EuiSpacer size="l" />
            <EuiCallOut
              color="success"
              iconType="check"
              title={i18n.translate('xpack.security.management.apiKeys.createSuccessMessage', {
                defaultMessage: "Created API key '{name}'",
                values: { name: this.state.createdApiKey.name },
              })}
            >
              <p>
                <FormattedMessage
                  id="xpack.security.management.apiKeys.successDescription"
                  defaultMessage="Copy this key now. You will not be able to view it again."
                />
              </p>
              <SelectableTokenField
                options={[
                  {
                    key: 'base64',
                    value: btoa(concatenated),
                    icon: 'empty',
                    label: i18n.translate('xpack.security.management.apiKeys.base64Label', {
                      defaultMessage: 'Base64',
                    }),
                    description: i18n.translate(
                      'xpack.security.management.apiKeys.base64Description',
                      {
                        defaultMessage: 'Format used to authenticate with Elasticsearch.',
                      }
                    ),
                  },
                  {
                    key: 'json',
                    value: JSON.stringify(this.state.createdApiKey),
                    icon: 'empty',
                    label: i18n.translate('xpack.security.management.apiKeys.jsonLabel', {
                      defaultMessage: 'JSON',
                    }),
                    description: i18n.translate(
                      'xpack.security.management.apiKeys.jsonDescription',
                      {
                        defaultMessage: 'Full API response.',
                      }
                    ),
                  },
                  {
                    key: 'beats',
                    value: concatenated,
                    icon: 'logoBeats',
                    label: i18n.translate('xpack.security.management.apiKeys.beatsLabel', {
                      defaultMessage: 'Beats',
                    }),
                    description: i18n.translate(
                      'xpack.security.management.apiKeys.beatsDescription',
                      {
                        defaultMessage: 'Format used to configure Beats.',
                      }
                    ),
                  },
                  {
                    key: 'logstash',
                    value: concatenated,
                    icon: 'logoLogstash',
                    label: i18n.translate('xpack.security.management.apiKeys.logstashLabel', {
                      defaultMessage: 'Logstash',
                    }),
                    description: i18n.translate(
                      'xpack.security.management.apiKeys.logstashDescription',
                      {
                        defaultMessage: 'Format used to configure Logstash.',
                      }
                    ),
                  },
                ]}
              />
            </EuiCallOut>
          </>
        )}

        <EuiSpacer size="l" />

        <KibanaPageTemplate.Section paddingSize="none">
          {this.renderTable()}
        </KibanaPageTemplate.Section>
      </>
    );
  }

  private renderTable = () => {
    const { apiKeys, selectedItems, isLoadingTable, isAdmin, error } = this.state;

    const message = isLoadingTable ? (
      <FormattedMessage
        id="xpack.security.management.apiKeys.table.apiKeysTableLoadingMessage"
        defaultMessage="Loading API keys…"
      />
    ) : undefined;

    const sorting = {
      sort: {
        field: 'creation',
        direction: 'desc',
      },
    } as const;

    const pagination = {
      initialPageSize: 20,
      pageSizeOptions: [10, 20, 50],
    };

    const selection = {
      onSelectionChange: (newSelectedItems: ApiKey[]) => {
        this.setState({
          selectedItems: newSelectedItems,
        });
      },
    };

    const search: EuiInMemoryTableProps<ApiKey>['search'] = {
      toolsLeft: selectedItems.length ? (
        <InvalidateProvider
          isAdmin={isAdmin}
          notifications={this.props.notifications}
          apiKeysAPIClient={this.props.apiKeysAPIClient}
        >
          {(invalidateApiKeyPrompt) => {
            return (
              <EuiButton
                onClick={() =>
                  invalidateApiKeyPrompt(
                    selectedItems.map(({ name, id }) => ({ name, id })),
                    this.onApiKeysInvalidated
                  )
                }
                color="danger"
                data-test-subj="bulkInvalidateActionButton"
              >
                <FormattedMessage
                  id="xpack.security.management.apiKeys.table.invalidateApiKeyButton"
                  defaultMessage="Delete {count, plural, one {API key} other {API keys}}"
                  values={{
                    count: selectedItems.length,
                  }}
                />
              </EuiButton>
            );
          }}
        </InvalidateProvider>
      ) : undefined,
      box: {
        incremental: true,
      },
      filters: isAdmin
        ? [
            {
              type: 'field_value_selection',
              field: 'username',
              name: i18n.translate('xpack.security.management.apiKeys.table.userFilterLabel', {
                defaultMessage: 'User',
              }),
              multiSelect: false,
              options: Object.keys(
                apiKeys?.reduce((apiKeysMap: any, apiKey) => {
                  apiKeysMap[apiKey.username] = true;
                  return apiKeysMap;
                }, {}) ?? {}
              ).map((username) => {
                return {
                  value: username,
                  view: (
                    <EuiToolTip delay="long" position="left" content={username}>
                      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <EuiIcon type="user" />
                        </EuiFlexItem>
                        <EuiFlexItem
                          css={css`
                            overflow: hidden;
                          `}
                          grow={false}
                        >
                          <EuiText className="eui-textTruncate">{username}</EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiToolTip>
                  ),
                };
              }),
            },
            {
              type: 'field_value_selection',
              field: 'realm',
              name: i18n.translate('xpack.security.management.apiKeys.table.realmFilterLabel', {
                defaultMessage: 'Realm',
              }),
              multiSelect: false,
              options: Object.keys(
                apiKeys?.reduce((apiKeysMap: any, apiKey) => {
                  apiKeysMap[apiKey.realm] = true;
                  return apiKeysMap;
                }, {}) ?? {}
              ).map((realm) => {
                return {
                  value: realm,
                  view: realm,
                };
              }),
            },
          ]
        : undefined,
    };

    const callOutTitle = this.determineCallOutTitle(this.props.readOnly ?? false);

    return (
      <>
        {!isAdmin ? (
          <>
            <EuiCallOut title={callOutTitle} color="primary" iconType="user" />
            <EuiSpacer />
          </>
        ) : undefined}

        <InvalidateProvider
          isAdmin={isAdmin}
          notifications={this.props.notifications}
          apiKeysAPIClient={this.props.apiKeysAPIClient}
        >
          {(invalidateApiKeyPrompt) => (
            <EuiInMemoryTable
              items={apiKeys ?? []}
              itemId="id"
              columns={this.getColumnConfig(invalidateApiKeyPrompt)}
              search={search}
              sorting={sorting}
              selection={this.props.readOnly ? undefined : selection}
              pagination={pagination}
              loading={isLoadingTable}
              error={
                error &&
                i18n.translate('xpack.security.management.apiKeysEmptyPrompt.errorMessage', {
                  defaultMessage: 'Could not load API keys.',
                })
              }
              message={message}
              isSelectable={true}
            />
          )}
        </InvalidateProvider>
      </>
    );
  };

  private getColumnConfig = (invalidateApiKeyPrompt: InvalidateApiKeys) => {
    const { isAdmin, createdApiKey } = this.state;

    let config: Array<EuiBasicTableColumn<ApiKey>> = [];

    config = config.concat([
      {
        field: 'name',
        name: i18n.translate('xpack.security.management.apiKeys.table.nameColumnName', {
          defaultMessage: 'Name',
        }),
        sortable: true,
        render: (name: string, recordAP: ApiKey) => {
          return (
            <EuiText color="subdued" size="s">
              <EuiLink
                data-test-subj={`roleRowName-${recordAP.name}`}
                onClick={() => {
                  this.setState({ selectedApiKey: recordAP, isUpdateFlyoutVisible: true });
                }}
              >
                {name}
              </EuiLink>
            </EuiText>
          );
        },
      },
    ]);

    if (isAdmin) {
      config = config.concat([
        {
          field: 'username',
          name: i18n.translate('xpack.security.management.apiKeys.table.userNameColumnName', {
            defaultMessage: 'User',
          }),
          sortable: true,
          render: (username: string) => (
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon type="user" />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText>{username}</EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          ),
        },
        {
          field: 'realm',
          name: i18n.translate('xpack.security.management.apiKeys.table.realmColumnName', {
            defaultMessage: 'Realm',
          }),
          sortable: true,
        },
      ]);
    }

    config = config.concat([
      {
        field: 'creation',
        name: i18n.translate('xpack.security.management.apiKeys.table.creationDateColumnName', {
          defaultMessage: 'Created',
        }),
        sortable: true,
        mobileOptions: {
          show: false,
        },
        render: (creation: string, item: ApiKey) => (
          <EuiToolTip content={moment(creation).format(DATE_FORMAT)}>
            {item.id === createdApiKey?.id ? (
              <EuiBadge color="success">
                <FormattedMessage
                  id="xpack.security.management.apiKeys.table.createdBadge"
                  defaultMessage="Just now"
                />
              </EuiBadge>
            ) : (
              <span>{moment(creation).fromNow()}</span>
            )}
          </EuiToolTip>
        ),
      },
      {
        name: i18n.translate('xpack.security.management.apiKeys.table.statusColumnName', {
          defaultMessage: 'Status',
        }),
        render: ({ expiration }: any) => {
          if (!expiration) {
            return (
              <EuiHealth color="primary">
                <FormattedMessage
                  id="xpack.security.management.apiKeys.table.statusActive"
                  defaultMessage="Active"
                />
              </EuiHealth>
            );
          }

          if (Date.now() > expiration) {
            return (
              <EuiHealth color="subdued">
                <FormattedMessage
                  id="xpack.security.management.apiKeys.table.statusExpired"
                  defaultMessage="Expired"
                />
              </EuiHealth>
            );
          }

          return (
            <EuiHealth color="warning">
              <EuiToolTip content={moment(expiration).format(DATE_FORMAT)}>
                <FormattedMessage
                  id="xpack.security.management.apiKeys.table.statusExpires"
                  defaultMessage="Expires {timeFromNow}"
                  values={{
                    timeFromNow: moment(expiration).fromNow(),
                  }}
                />
              </EuiToolTip>
            </EuiHealth>
          );
        },
      },
    ]);

    if (!this.props.readOnly) {
      config.push({
        actions: [
          {
            name: i18n.translate('xpack.security.management.apiKeys.table.deleteAction', {
              defaultMessage: 'Delete',
            }),
            description: i18n.translate(
              'xpack.security.management.apiKeys.table.deleteDescription',
              {
                defaultMessage: 'Delete this API key',
              }
            ),
            icon: 'trash',
            type: 'icon',
            color: 'danger',
            onClick: (item) =>
              invalidateApiKeyPrompt([{ id: item.id, name: item.name }], this.onApiKeysInvalidated),
            'data-test-subj': 'apiKeysTableDeleteAction',
          },
        ],
      });
    }

    return config;
  };

  private onApiKeysInvalidated = (apiKeysInvalidated: ApiKeyToInvalidate[]): void => {
    if (apiKeysInvalidated.length) {
      this.reloadApiKeys();
    }
  };

  private async checkPrivileges() {
    try {
      const { isAdmin, canManage, areApiKeysEnabled } =
        await this.props.apiKeysAPIClient.checkPrivileges();
      this.setState({ isAdmin, canManage, areApiKeysEnabled });

      if ((!canManage && !this.props.readOnly) || !areApiKeysEnabled) {
        this.setState({ isLoadingApp: false });
      } else {
        this.loadApiKeys();
      }
    } catch (e) {
      this.props.notifications.toasts.addDanger(
        i18n.translate('xpack.security.management.apiKeys.table.fetchingApiKeysErrorMessage', {
          defaultMessage: 'Error checking privileges: {message}',
          values: { message: e.body?.message ?? '' },
        })
      );
    }
  }

  private reloadApiKeys = () => {
    this.setState({
      isLoadingApp: false,
      isLoadingTable: true,
      createdApiKey: undefined,
      error: undefined,
    });
    this.loadApiKeys();
  };

  private loadApiKeys = async () => {
    try {
      const { isAdmin } = this.state;
      const { apiKeys } = await this.props.apiKeysAPIClient.getApiKeys(isAdmin);
      this.setState({ apiKeys });
    } catch (e) {
      this.setState({ error: e });
    }

    this.setState({ isLoadingApp: false, isLoadingTable: false });
  };

  private determineDescription(isAdmin: boolean, readOnly: boolean) {
    if (isAdmin) {
      return (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.apiKeysAllDescription"
          defaultMessage="View and delete API keys, which send requests on behalf of a user."
        />
      );
    } else if (readOnly) {
      return (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.apiKeysReadOnlyDescription"
          defaultMessage="View your API keys, which send requests on your behalf."
        />
      );
    } else {
      return (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.apiKeysOwnDescription"
          defaultMessage="View and delete your API keys, which send requests on your behalf."
        />
      );
    }
  }

  private determineCallOutTitle(readOnly: boolean) {
    if (readOnly) {
      return (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.readOnlyOwnKeysWarning"
          defaultMessage="You only have permission to view your own API keys."
        />
      );
    } else {
      return (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.manageOwnKeysWarning"
          defaultMessage="You only have permission to manage your own API keys."
        />
      );
    }
  }

  private displayUpdatedApiKeyToast(updateApiKeyResponse?: UpdateApiKeyResponse) {
    if (updateApiKeyResponse) {
      this.props.notifications.toasts.addSuccess({
        title: i18n.translate('xpack.security.management.apiKeys.updateSuccessMessage', {
          defaultMessage: "Updated API key '{name}'",
          values: { name: this.state.selectedApiKey?.name },
        }),
        'data-test-subj': 'updateApiKeySuccessToast',
      });
    }
  }
}
