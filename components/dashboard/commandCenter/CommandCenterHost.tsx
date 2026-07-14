import React, { useEffect, useMemo } from 'react';

import { CommandCenterFrame } from './CommandCenterFrame';
import {
  COMMAND_CENTER_DEFAULT_MODE,
  getCommandCenterWidgetDefinition,
  getSelectableCommandCenterModes,
  resolveCommandCenterMode,
} from './commandCenterRegistry';
import type {
  CommandCenterDataContext,
  CommandCenterMode,
  CommandCenterWidgetComponentProps,
} from './commandCenterTypes';
import { ecsLog } from '../../../lib/ecsLogger';
import { reportRecoverableFailure } from '../../../lib/ecsIssueIntelligence';

type ExternalCommandCenterRenderer = (
  props: CommandCenterWidgetComponentProps,
) => React.ReactNode;

type Props = {
  mode: CommandCenterMode;
  availableModes?: CommandCenterMode[];
  onModeChange: (mode: CommandCenterMode) => void;
  dataContext?: CommandCenterDataContext;
  externalRenderers?: Partial<Record<CommandCenterMode, ExternalCommandCenterRenderer>>;
  fallbackMode?: CommandCenterMode;
  testID?: string;
};

type HostErrorBoundaryProps = {
  children: React.ReactNode;
  definitionLabel: string;
  mode: CommandCenterMode;
  availableModes: CommandCenterMode[];
  onModeChange: (mode: CommandCenterMode) => void;
  testID?: string;
};

type HostErrorBoundaryState = {
  hasError: boolean;
};

function ExternalCommandCenterContent({
  renderExternal,
  commonProps,
}: {
  renderExternal: ExternalCommandCenterRenderer;
  commonProps: CommandCenterWidgetComponentProps;
}) {
  return <>{renderExternal(commonProps)}</>;
}

class CommandCenterHostErrorBoundary extends React.Component<
  HostErrorBoundaryProps,
  HostErrorBoundaryState
> {
  state: HostErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): HostErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const componentStack = info.componentStack?.split('\n').slice(0, 6).join('\n') ?? null;
    ecsLog.captureFailure({
      kind: 'unexpected',
      domain: 'dashboard',
      operation: 'command_center_render',
      code: 'COMMAND_CENTER_WIDGET_RENDER_FAILURE',
      severity: 'error',
      recoverability: 'user_action',
      retryability: 'conditional',
      sourceState: 'unavailable',
      context: {
        mode: this.props.mode,
        componentStack,
      },
    }, error, {
      category: 'WIDGET',
      fingerprint: this.props.mode,
    });
    reportRecoverableFailure({
      severity: 'medium',
      issueTitle: 'Command Center widget render failure',
      ecsArea: 'dashboard',
      error,
      signature: `command_center_boundary:${this.props.mode}`,
      metadata: {
        mode: this.props.mode,
        componentStack,
      },
      fallbackUsed: true,
    });
  }

  componentDidUpdate(previousProps: HostErrorBoundaryProps) {
    if (previousProps.mode !== this.props.mode && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <CommandCenterFrame
          title={this.props.definitionLabel.toUpperCase()}
          subtitle="Command widget unavailable"
          state="setupNeeded"
          stateLabel="SETUP NEEDED"
          mode={this.props.mode}
          availableModes={this.props.availableModes}
          onModeChange={this.props.onModeChange}
          testID={this.props.testID}
        >
          {null}
        </CommandCenterFrame>
      );
    }

    return this.props.children;
  }
}

export default function CommandCenterHost({
  mode,
  availableModes,
  onModeChange,
  dataContext,
  externalRenderers,
  fallbackMode = COMMAND_CENTER_DEFAULT_MODE,
  testID,
}: Props) {
  const resolvedMode = resolveCommandCenterMode(mode, dataContext, fallbackMode);
  const selectableModes = useMemo(
    () => availableModes ?? getSelectableCommandCenterModes(dataContext),
    [availableModes, dataContext],
  );
  const definition = getCommandCenterWidgetDefinition(resolvedMode);

  useEffect(() => {
    if (resolvedMode !== mode) {
      onModeChange(resolvedMode);
    }
  }, [mode, onModeChange, resolvedMode]);

  if (!definition) {
    ecsLog.captureFailure({
      kind: 'configuration',
      domain: 'dashboard',
      operation: 'resolve_command_center_widget',
      code: 'COMMAND_CENTER_WIDGET_DEFINITION_MISSING',
      sourceState: 'missing',
      context: { mode: resolvedMode },
    }, undefined, {
      category: 'WIDGET',
      fingerprint: resolvedMode,
    });
    return null;
  }

  const commonProps: CommandCenterWidgetComponentProps = {
    mode: resolvedMode,
    availableModes: selectableModes,
    onModeChange,
    testID,
  };

  if (definition.component) {
    const Component = definition.component;
    return (
      <CommandCenterHostErrorBoundary
        definitionLabel={definition.label}
        mode={resolvedMode}
        availableModes={selectableModes}
        onModeChange={onModeChange}
        testID={testID}
      >
        <Component {...commonProps} />
      </CommandCenterHostErrorBoundary>
    );
  }

  const renderExternal = externalRenderers?.[resolvedMode];
  if (renderExternal) {
    return (
      <CommandCenterHostErrorBoundary
        definitionLabel={definition.label}
        mode={resolvedMode}
        availableModes={selectableModes}
        onModeChange={onModeChange}
        testID={testID}
      >
        <ExternalCommandCenterContent renderExternal={renderExternal} commonProps={commonProps} />
      </CommandCenterHostErrorBoundary>
    );
  }

  const renderFallback = externalRenderers?.[fallbackMode];
  if (renderFallback) {
    ecsLog.dev('WIDGET', 'command_center_fallback', {
      resolvedMode,
      fallbackMode,
    }, {
      debugFlag: 'ECS_DEBUG_DASHBOARD',
      fingerprint: `${resolvedMode}:${fallbackMode}`,
    });
    return (
      <>
        {renderFallback({
          ...commonProps,
          mode: fallbackMode,
        })}
      </>
    );
  }

  return (
    <CommandCenterFrame
      title={definition.label.toUpperCase()}
      subtitle="Command widget unavailable"
      state="setupNeeded"
      stateLabel="SETUP NEEDED"
      mode={resolvedMode}
      availableModes={selectableModes}
      onModeChange={onModeChange}
      testID={testID}
    >
      {null}
    </CommandCenterFrame>
  );
}
