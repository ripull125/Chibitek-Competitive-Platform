import { forwardRef } from "react";
import { Card, Title } from "@mantine/core";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const KeywordTracking = forwardRef(
  ({ selectedDatasets }, ref) => {
    const datasets = [
      {
        title: "Sample Data #1",
        data: [
          { keyword: "fiction", freq: 12 },
          { keyword: "nonfiction", freq: 7 },
          { keyword: "history", freq: 5 },
        ],
      },
      {
        title: "Sample Data #2",
        data: [
          { keyword: "cooking", freq: 9 },
          { keyword: "biography", freq: 4 },
          { keyword: "science", freq: 6 },
        ],
      },
    ];

    return (
      <div ref={ref}>
        <Title order={2} mb="lg">
          Keyword Tracking
        </Title>

        {datasets.map(
          (set, index) =>
            (!selectedDatasets || selectedDatasets[index]) && (
              <Card key={index} shadow="sm" p="lg" radius="md" mb="lg">
                <Title order={4} mb="md">
                  {set.title}
                </Title>

                <ResponsiveContainer width="60%" height={320}>
                  <BarChart data={set.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="keyword" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="freq" fill="#4dabf7" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )
        )}
      </div>
    );
  }
);

export default KeywordTracking;
