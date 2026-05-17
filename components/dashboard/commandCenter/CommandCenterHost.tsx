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

  componentDidCatch(error: unknown) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ECS_COMMAND_CENTER] Command widget render failed', error);
    }
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
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[ECS_COMMAND_CENTER] Missing command widget definition for ${resolvedMode}`);
    }
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
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[ECS_COMMAND_CENTER] Falling back from ${resolvedMode} to ${fallbackMode}`);
    }
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
