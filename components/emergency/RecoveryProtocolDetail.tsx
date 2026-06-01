import React from 'react';

import FieldUseProtocolDetail, { type FieldUseGuideProtocol } from './FieldUseProtocolDetail';
import type { RecoveryProtocol } from './RecoveryProtocolData';

type Props = {
  protocol: RecoveryProtocol;
};

function toFieldUseGuide(protocol: RecoveryProtocol): FieldUseGuideProtocol {
  return {
    id: protocol.id,
    title: protocol.title,
    subtitle: protocol.subtitle,
    accentColor: protocol.accentColor,
    image: protocol.image,
    beforeLabel: 'BEFORE YOU PULL',
    beforeItems: protocol.beforeYouPull,
    stepCards: protocol.stepCards,
    warningLabel: 'DO NOT',
    warningItems: protocol.doNot,
    completionLabel: 'COMPLETION CHECK',
    completionItems: protocol.completionCheck,
  };
}

export default function RecoveryProtocolDetail({ protocol }: Props) {
  return <FieldUseProtocolDetail protocol={toFieldUseGuide(protocol)} />;
}
