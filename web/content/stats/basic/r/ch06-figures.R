# 第 6 章的 R 圖檔產生程式(四大抽樣分配：標準常態、卡方、t、F)
# 用法(在 little-trader 資料夾下)：Rscript web/content/stats/basic/r/ch06-figures.R web/content/stats/basic/img
out <- commandArgs(TRUE)[1]
blue <- "steelblue"; orange <- "darkorange"; red <- "firebrick"; green <- "forestgreen"
png(file.path(out, "ch06-sampling.png"), width = 1000, height = 800, res = 120, type = "cairo")
par(mfrow = c(2, 2), mar = c(4.2, 4.2, 3, 1))

# (1) 標準常態：雙尾 5% 的臨界值 ±1.96
z <- seq(-4, 4, length.out = 400)
plot(z, dnorm(z), type = "l", lwd = 2.5, col = blue, main = "Standard normal  Z ~ N(0, 1)", xlab = "z", ylab = "density")
for (s in c(-1, 1)) {
  zz <- if (s < 0) seq(-4, -1.96, length.out = 100) else seq(1.96, 4, length.out = 100)
  polygon(c(zz[1], zz, zz[100]), c(0, dnorm(zz), 0), col = adjustcolor(red, 0.35), border = NA)
}
abline(v = c(-1.96, 1.96), lty = 3, col = "grey40")
text(2.6, 0.09, "2.5%", col = red, font = 2); text(-2.6, 0.09, "2.5%", col = red, font = 2)
text(0, 0.03, "-1.96 < z < 1.96: 95%", cex = 0.85)

# (2) 卡方：自由度越大越往右、越對稱(平均 k、變異數 2k)
x <- seq(0.01, 20, length.out = 500)
plot(x, dchisq(x, 1), type = "l", lwd = 2.5, col = blue, ylim = c(0, 0.5), main = "Chi-square  chi^2(k)", xlab = "x", ylab = "density")
lines(x, dchisq(x, 3), lwd = 2.5, col = orange); lines(x, dchisq(x, 5), lwd = 2.5, col = red); lines(x, dchisq(x, 10), lwd = 2.5, col = green)
legend("topright", c("k = 1", "k = 3", "k = 5", "k = 10"), col = c(blue, orange, red, green), lwd = 2.5, bty = "n")

# (3) t 分配 vs 標準常態：自由度小時尾巴較厚，自由度變大趨近常態
plot(z, dnorm(z), type = "l", lwd = 2.5, lty = 2, col = "grey30", ylim = c(0, 0.42), main = "t(df) vs N(0, 1)", xlab = "t", ylab = "density")
lines(z, dt(z, 1), lwd = 2.5, col = red); lines(z, dt(z, 5), lwd = 2.5, col = orange); lines(z, dt(z, 30), lwd = 2.5, col = blue)
legend("topright", c("N(0, 1)", "df = 1", "df = 5", "df = 30"), col = c("grey30", red, orange, blue), lwd = 2.5, lty = c(2, 1, 1, 1), bty = "n")
text(-4, 0.33, sprintf("2-sided 5%% critical value\ndf = 5: %.3f\ndf = 30: %.3f\nnormal: 1.960", qt(0.975, 5), qt(0.975, 30)), adj = 0, cex = 0.8)

# (4) F 分配：兩個卡方各除以自由度的比值，恆為正、右偏
f <- seq(0.01, 5, length.out = 500)
plot(f, df(f, 1, 10), type = "l", lwd = 2.5, col = blue, ylim = c(0, 1.5), main = "F(d1, d2)", xlab = "F", ylab = "density")
lines(f, df(f, 5, 10), lwd = 2.5, col = orange); lines(f, df(f, 10, 30), lwd = 2.5, col = red); lines(f, df(f, 30, 60), lwd = 2.5, col = green)
legend("topright", c("F(1, 10)", "F(5, 10)", "F(10, 30)", "F(30, 60)"), col = c(blue, orange, red, green), lwd = 2.5, bty = "n")
dev.off()
