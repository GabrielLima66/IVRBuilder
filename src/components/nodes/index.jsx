import React from 'react';
import ActionNode from './ActionNode';
import BlankLineNode from './BlankLineNode';
import ConfigNode from './ConfigNode';
import ContextNode from './ContextNode';
import CommentedNode from './CommentedNode';
import IntegrationNode from './IntegrationNode';
import MenuNode from './MenuNode';
import RawNode from './RawNode';
import RouteNode from './RouteNode';
import SectionCommentNode from './SectionCommentNode';
import TimeNode from './TimeNode';

const mkActionType = (type) => (props) => <ActionNode {...props} type={type} />;

export const nodeTypes = {
  context:        ContextNode,
  config:         ConfigNode,
  menu:           MenuNode,
  time:           TimeNode,
  route:          RouteNode,
  commented:      CommentedNode,
  raw:            RawNode,
  integration:    IntegrationNode,
  // Elementos de formatação (importados do .conf — sem handles)
  blankline:      BlankLineNode,
  sectioncomment: SectionCommentNode,
  // Controle de Fluxo
  gosub:       mkActionType('gosub'),
  return:      mkActionType('return'),
  hangup:      mkActionType('hangup'),
  gotoif:      mkActionType('gotoif'),
  // Execução Lógica
  set:         mkActionType('set'),
  agi:         mkActionType('agi'),
  macro:       mkActionType('macro'),
  execif:      mkActionType('execif'),
  execiftime:  mkActionType('execiftime'),
  noop:        mkActionType('noop'),
  verbose:     mkActionType('verbose'),
  // Diretivas / Integração SIP
  include:      mkActionType('include'),
  sipaddheader: mkActionType('sipaddheader'),
  // Interação & Monitoramento
  dial:        mkActionType('dial'),
  read:        mkActionType('read'),
  saydigits:   mkActionType('saydigits'),
  saynumber:   mkActionType('saynumber'),
  mixmonitor:  mkActionType('mixmonitor'),
  stopmonitor: mkActionType('stopmonitor'),
  chanspy:     mkActionType('chanspy'),
  // Sistema / Áudio
  answer:      mkActionType('answer'),
  wait:        mkActionType('wait'),
  waitexten:   mkActionType('waitexten'),
  playback:    mkActionType('playback'),
  background:  mkActionType('background'),
};
