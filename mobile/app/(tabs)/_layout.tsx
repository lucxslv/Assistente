import React from 'react';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Barra de navegação inferior persistente e minimalista com exatamente 4 destinos:
 * Home (Command Center) | Charlie (Conversação & Gen-UI) | Workspace (Operações) | Agent (Mission Control).
 *
 * Aplica insets dinâmicos de safe area para eliminar sobreposição com as barras de gestos do Android e iOS.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0D0F12',
          borderTopColor: '#1F242D',
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#818CF8',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '700',
        },
        tabBarIconStyle: {
          display: 'none',
        },
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync();
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="charlie"
        options={{
          title: 'Charlie',
        }}
      />
      <Tabs.Screen
        name="workspace"
        options={{
          title: 'Workspace',
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          title: 'Agent',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
