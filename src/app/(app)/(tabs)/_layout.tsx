import { Tabs } from 'expo-router';

import { GlassTabBar } from '@/components/GlassTabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="tasks" />
      <Tabs.Screen name="record" />
      <Tabs.Screen name="notes" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
