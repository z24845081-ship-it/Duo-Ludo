(function (DL) {
  'use strict';

  DL.config = {
    version: '1.0.1',
    lane: 5,
    players: [
      { id: 'azure', main: '#4F83E8', deep: '#315FBC', light: '#C9D9FA', soft: '#EAF0FE', ink: '#254A96' },
      { id: 'rose', main: '#E56F98', deep: '#B94E76', light: '#F8CBD9', soft: '#FCEAF0', ink: '#943B5C' }
    ],
    palette: { ink: '#252B3D', muted: '#727C91', hair: '#E5EAF3', road: '#EDF2FF', gold: '#EDB54A', bolt: '#8E7CF0' },
    // The default player pair remains blue and rose. These three alternatives
    // are the only extra Playground Appearance colours shown in Settings.
    playerPalettes: {
      teal:   { name: 'Teal', main: '#168E8A', deep: '#0D6865', light: '#BCE8E5', soft: '#E4F6F4', ink: '#0B5855' },
      orange: { name: 'Orange', main: '#E58A38', deep: '#B76520', light: '#F7D5B4', soft: '#FDF0E3', ink: '#914B18' },
      violet: { name: 'Violet', main: '#8064D8', deep: '#5C43AD', light: '#D9D0F5', soft: '#F0ECFC', ink: '#49358C' }
    },
    boardThemes: {
      soft: { name: 'Soft Cloud', background1: '#FFFFFF', background2: '#F3F6FE', frame: '#E1E8F6', road: '#EDF2FF', roadLine: '#DCE6FA', inset: 'rgba(79,131,232,0.20)', safe: '#EDB54A', boost: '#8E7CF0', junction: '#F2EDFF' },
      classic: { name: 'Classic Ivory', background1: '#FFFEFA', background2: '#F5F0E4', frame: '#E6DCC7', road: '#F2EBDD', roadLine: '#DCCFB6', inset: 'rgba(165,129,76,0.22)', safe: '#D9A441', boost: '#6C9E9A', junction: '#F4E9D8' },
      midnight: { name: 'Midnight', background1: '#29334A', background2: '#20293D', frame: '#495875', road: '#39465F', roadLine: '#566783', inset: 'rgba(190,207,240,0.20)', safe: '#E4B857', boost: '#9C8BEA', junction: '#45415F' },
      mint: { name: 'Mint Garden', background1: '#F9FFFC', background2: '#EAF7F0', frame: '#CFE5D8', road: '#E2F1E8', roadLine: '#C9E0D2', inset: 'rgba(60,154,103,0.18)', safe: '#D6A541', boost: '#6B9FE3', junction: '#EAEAF8' }
    },
    levels: {
      easy: { label: 'Chill', noise: 20, random: true },
      normal: { label: 'Smart', noise: 5 },
      hard: { label: 'Genius', noise: 0 }
    },
    storageKey: 'duoludo.settings.v2',
    historyKey: 'duoludo.history.v1'
  };
})(globalThis.DL = globalThis.DL || {});
