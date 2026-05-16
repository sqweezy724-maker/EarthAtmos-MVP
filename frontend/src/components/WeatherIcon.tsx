import {
  WiDaySunny, WiCloudy, WiRain, WiSnow, WiThunderstorm,
  WiNightClear, WiNightCloudy, WiNightRain,
} from "react-icons/wi";

interface Props {
  type: string;
  hour?: number;
  size?: number;
}

export function WeatherIcon({ type, hour = 12, size = 24 }: Props) {
  const night = hour < 6 || hour >= 20;
  const s = { fontSize: size, color: color(type) };

  switch (type) {
    case "clear":  return night ? <WiNightClear style={s} />  : <WiDaySunny style={s} />;
    case "cloudy": return night ? <WiNightCloudy style={s} /> : <WiCloudy style={s} />;
    case "rain":   return night ? <WiNightRain style={s} />   : <WiRain style={s} />;
    case "snow":   return <WiSnow style={s} />;
    case "storm":  return <WiThunderstorm style={s} />;
    default:       return <WiCloudy style={s} />;
  }
}

function color(type: string) {
  switch (type) {
    case "clear":  return "#f59e0b";
    case "cloudy": return "#94a3b8";
    case "rain":   return "#3b82f6";
    case "snow":   return "#60a5fa";
    case "storm":  return "#8b5cf6";
    default:       return "#94a3b8";
  }
}