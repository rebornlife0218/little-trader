# 第 1 章的 R 圖檔產生程式
# 用法(在 little-trader 資料夾下)：Rscript content/stats/basic/r/ch01-figures.R content/stats/basic/img
library(MASS)
out <- commandArgs(TRUE)[1]
dev <- function(f) png(file.path(out, f), width = 760, height = 520, res = 120, type = "cairo")
dev("ch01-bar.png"); barplot(table(Pima.tr$type), col = "steelblue", main = "Bar graph: type (Pima.tr)", xlab = "type", ylab = "Frequency"); dev.off()
race <- factor(birthwt$race, labels = c("White", "African-American", "Other"))
dev("ch01-pie.png"); pie(table(race), col = c("steelblue", "orange", "grey70"), main = "Pie chart: race (birthwt)"); dev.off()
dev("ch01-hist.png"); hist(Pima.tr$bmi, col = "steelblue", border = "white", main = "Histogram: bmi (Pima.tr)", xlab = "bmi"); dev.off()
dev("ch01-box.png"); boxplot(bwt ~ factor(smoke, labels = c("No", "Yes")), data = birthwt, col = c("steelblue", "orange"), main = "Boxplot: bwt by smoke (birthwt)", xlab = "smoke", ylab = "bwt (g)"); dev.off()
dev("ch01-scatter.png"); plot(bwt ~ lwt, data = birthwt, pch = 19, col = "steelblue", main = "Scatter plot: bwt vs lwt (birthwt)", xlab = "lwt (lb)", ylab = "bwt (g)"); abline(lm(bwt ~ lwt, data = birthwt), col = "orange", lwd = 2); dev.off()
dev("ch01-line.png"); plot(AirPassengers, col = "steelblue", lwd = 2, main = "Line chart: AirPassengers", ylab = "Passengers (1000s)"); dev.off()
