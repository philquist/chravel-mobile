import { Text, type TextProps, type TextStyle, type StyleProp } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

interface GradientTextProps extends Omit<TextProps, "style"> {
  style?: StyleProp<TextStyle>;
  colors?: readonly [string, string, ...string[]];
}

const DEFAULT_GOLD_GRADIENT = ["#FFD700", "#D4AF37", "#B8860B"] as const;

export function GradientText({
  style,
  colors = DEFAULT_GOLD_GRADIENT,
  children,
  ...rest
}: GradientTextProps) {
  return (
    <MaskedView
      maskElement={
        <Text {...rest} style={[style, { backgroundColor: "transparent" }]}>
          {children}
        </Text>
      }
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text {...rest} style={[style, { opacity: 0 }]}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}
