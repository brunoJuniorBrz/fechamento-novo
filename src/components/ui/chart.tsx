
"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
    fillOpacity?: number // Added fillOpacity directly to the config type
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer /> or <ChartProvider />")
  }

  return context
}

// ChartProvider component
const ChartProvider = ({
  config,
  children,
}: {
  config: ChartConfig;
  children: React.ReactNode;
}) => {
  return (
    <ChartContext.Provider value={{ config }}>
      {children}
    </ChartContext.Provider>
  );
};
ChartProvider.displayName = "ChartProvider";


const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"]
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    // Wrap with ChartProvider to ensure context is available
    <ChartProvider config={config}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartProvider>
  )
})
ChartContainer.displayName = "Chart"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color
    // Include fillOpacity in the generated CSS variables
    const fillOpacity = itemConfig.fillOpacity;
    let style = color ? `  --color-${key}: ${color};` : '';
    // Always include fillOpacity if defined in config
    if (fillOpacity !== undefined) {
         style += ` --fill-opacity-${key}: ${fillOpacity};`;
     }
     return style || null;
  })
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
      formatter?: (value: any, name: any, item: any, index: any, payload: any) => React.ReactNode; // Add formatter prop
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter, // Receive formatter
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart(); // Context is available via ChartContainer/ChartProvider

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null
      }

      const [item] = payload
      const key = `${labelKey || item.dataKey || item.name || "value"}`
      const itemConfig = getPayloadConfigFromPayload(config, item, key)
      const value =
        !labelKey && typeof label === "string"
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label

      if (labelFormatter) {
        return (
          <div className={cn("font-medium", labelClassName)}>
            {labelFormatter(value, payload)}
          </div>
        )
      }

      if (!value) {
        return null
      }

      return <div className={cn("font-medium", labelClassName)}>{value}</div>
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      config,
      labelKey,
    ])

    if (!active || !payload?.length) {
      return null
    }

    const nestLabel = payload.length === 1 && indicator !== "dot"

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color || item.payload.fill || item.color
             // Try to get fillOpacity from the nested payload first, then config, then fallback to 1
             const indicatorFillOpacity =
               item.payload?.payload?.fillOpacity ?? itemConfig?.fillOpacity ?? 1;

            return (
              <div
                key={item.dataKey || item.name || index} // Use a more robust key
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center"
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                   // Pass item.payload to formatter for potential access to original data
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-[--color-border]", // Removed bg-[--color-bg] initially
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            }
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                              backgroundColor: indicatorColor, // Apply background color directly
                              opacity: indicatorFillOpacity, // Apply fill opacity
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value !== undefined && item.value !== null && ( // Check for undefined and null
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {typeof item.value === 'number' ? item.value.toLocaleString() : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltip"

const ChartLegend = RechartsPrimitive.Legend

// Define explicit type for payload items in Legend
interface LegendPayloadItem extends RechartsPrimitive.LegendProps {
    payload?: {
        value: string | number; // The name/value of the item
        color: string; // The color of the item
        // Correctly define the nested payload structure if it exists
        payload?: {
             payload?: { // Potential deeper nesting observed in Recharts payload
                fillOpacity?: number; // Potential location of fillOpacity
             }
             fillOpacity?: number; // Another potential location
        };
    }[];
}


const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Pick<LegendPayloadItem, "payload" | "verticalAlign"> & { // Use the refined type
      hideIcon?: boolean
      nameKey?: string
    }
>(
  (
    { className, hideIcon = false, payload, verticalAlign = "bottom", nameKey },
    ref
  ) => {
    const { config } = useChart(); // Context is available via ChartContainer/ChartProvider

    if (!payload?.length) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-4",
          verticalAlign === "top" ? "pb-3" : "pt-3",
          className
        )}
      >
        {payload.map((item) => {
            const key = `${nameKey || item.value || "value"}` // Prefer nameKey, fallback to item.value
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const label = itemConfig?.label || item.value; // Use config label or fallback to value
             // Access fillOpacity safely from the nested payload, checking multiple levels
             const itemFillOpacity = item.payload?.payload?.payload?.fillOpacity ?? item.payload?.payload?.fillOpacity ?? itemConfig?.fillOpacity ?? 1;

          return (
            <div
              key={String(item.value)} // Use string conversion for key
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                    opacity: itemFillOpacity, // Apply opacity here as well
                  }}
                />
              )}
              {label}
            </div>
          )
        })}
      </div>
    )
  }
)
ChartLegendContent.displayName = "ChartLegend"

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  // Try to find the key directly in the payload or nested payload
  if (key in payload && typeof payload[key as keyof typeof payload] === "string") {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (payloadPayload && key in payloadPayload && typeof payloadPayload[key as keyof typeof payloadPayload] === "string") {
    configLabelKey = payloadPayload[key as keyof typeof payloadPayload] as string;
  }

  // If the key doesn't directly map to a config entry, try matching by label
  if (!(configLabelKey in config)) {
    const payloadValue = 'value' in payload ? String(payload.value) : undefined; // Use 'value' as the fallback identifier
    if (payloadValue !== undefined) {
      const foundKey = Object.keys(config).find(k => config[k as keyof ChartConfig]?.label === payloadValue);
      if (foundKey) {
        configLabelKey = foundKey;
      }
    }
  }

  // Return the config entry if found, otherwise fallback to the original key if it exists in config
  return configLabelKey in config
    ? config[configLabelKey]
    : (key in config ? config[key as keyof typeof config] : undefined);
}


// Export Recharts components for direct use
export const BarChart = RechartsPrimitive.BarChart;
export const Bar = RechartsPrimitive.Bar;
export const XAxis = RechartsPrimitive.XAxis;
export const YAxis = RechartsPrimitive.YAxis;
export const CartesianGrid = RechartsPrimitive.CartesianGrid;
export const PieChart = RechartsPrimitive.PieChart;
export const Pie = RechartsPrimitive.Pie;
export const Cell = RechartsPrimitive.Cell;
export const Legend = RechartsPrimitive.Legend;
export const ResponsiveContainer = RechartsPrimitive.ResponsiveContainer;

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartProvider, // Export ChartProvider
  useChart // Export useChart hook
}
