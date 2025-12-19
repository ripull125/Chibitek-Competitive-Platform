import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, Title } from "@mantine/core";

export default function CompetitorTracking() {
  const datasets = [
    {
      title: "Week 1 Engagement",
      data: [
        { competitor: "Brand A", posts: 12, likes: 340 },
        { competitor: "Brand B", posts: 25, likes: 610 },
        { competitor: "Brand C", posts: 8, likes: 190 },
      ],
    },
    {
      title: "Week 2 Engagement",
      data: [
        { competitor: "Brand D", posts: 30, likes: 880 },
        { competitor: "Brand E", posts: 18, likes: 450 },
        { competitor: "Brand F", posts: 22, likes: 520 },
      ],
    },
  ];

  return (
    <>
      {/* PAGE-LEVEL TITLE */}
      <Title order={2} mb="lg">
        Competitor Tracking
      </Title>

      {datasets.map((set, index) => (
        <Card key={index} shadow="sm" p="md" radius="md" mb="lg">
          {/* CARD-LEVEL TITLE */}
          <Title order={4} mb="md">
            {set.title}
          </Title>

          <ResponsiveContainer width="60%" height={300}>
            <ScatterChart>
              <CartesianGrid />

              <XAxis
                type="number"
                dataKey="posts"
                name="Posts"
                label={{
                  value: "Number of Posts",
                  position: "insideBottom",
                  offset: -5,
                }}
              />

              <YAxis
                type="number"
                dataKey="likes"
                name="Likes"
                label={{
                  value: "Likes (Reception)",
                  angle: -90,
                  position: "insideLeft",
                }}
              />

              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(value, name) => [value, name]}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.competitor
                }
              />

              <Scatter data={set.data} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      ))}
    </>
  );
}
