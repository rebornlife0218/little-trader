# 第 5 章的 R 圖檔產生程式(標準常態、對數常態、平移指數、雙指數與常態的比較)
# 用法(在 little-trader 資料夾下)：Rscript web/content/stats/basic/r/ch05-figures.R web/content/stats/basic/img
out <- commandArgs(TRUE)[1]
blue <- "steelblue"; orange <- "darkorange"; red <- "firebrick"
png(file.path(out, "ch05-shapes.png"), width = 1000, height = 800, res = 120, type = "cairo")
par(mfrow = c(2, 2), mar = c(4.2, 4.2, 3, 1))

# (1) 標準常態：±1、±2 個標準差內的機率
z <- seq(-4, 4, length.out = 400)
plot(z, dnorm(z), type = "l", lwd = 2.5, col = blue, main = "Standard normal  Z ~ N(0, 1)", xlab = "z", ylab = "density")
polygon(c(-2, seq(-2, 2, length.out = 200), 2), c(0, dnorm(seq(-2, 2, length.out = 200)), 0), col = adjustcolor(blue, 0.18), border = NA)
polygon(c(-1, seq(-1, 1, length.out = 200), 1), c(0, dnorm(seq(-1, 1, length.out = 200)), 0), col = adjustcolor(blue, 0.35), border = NA)
text(0, 0.17, "68.3%", font = 2); text(0, 0.03, "95.4%  (|z| < 2)", cex = 0.85)

# (2) 對數常態：μ = 0，σ 越大越右偏
x <- seq(0.001, 4, length.out = 400)
plot(x, dlnorm(x, 0, 0.25), type = "l", lwd = 2.5, col = blue, ylim = c(0, 1.7), main = "Lognormal  ln X ~ N(0, sigma^2)", xlab = "x", ylab = "density")
lines(x, dlnorm(x, 0, 0.5), lwd = 2.5, col = orange); lines(x, dlnorm(x, 0, 1), lwd = 2.5, col = red)
abline(v = 1, lty = 3, col = "grey40")
legend("topright", c("sigma = 0.25", "sigma = 0.5", "sigma = 1"), col = c(blue, orange, red), lwd = 2.5, bty = "n")
text(1.05, 1.62, "median = e^mu = 1", adj = 0, cex = 0.8, col = "grey30")

# (3) 指數 vs 平移指數：形狀相同，整條往右移 theta
t <- seq(0, 10, length.out = 400)
plot(t, dexp(t, 0.5), type = "l", lwd = 2.5, col = blue, main = "Exponential vs shifted exponential", xlab = "x", ylab = "density", ylim = c(0, 0.55))
lines(t, ifelse(t >= 2, 0.5 * exp(-0.5 * (t - 2)), 0), lwd = 2.5, col = orange)
legend("topright", c("Exp(lambda = 0.5)", "shifted: theta = 2"), col = c(blue, orange), lwd = 2.5, bty = "n")

# (4) 常態 vs 雙指數(變異數都是 1)：雙指數峰更尖、尾巴更厚
y <- seq(-5, 5, length.out = 600); b <- 1 / sqrt(2)
plot(y, dnorm(y), type = "l", lwd = 2.5, col = blue, ylim = c(0, 0.75), main = "Normal vs Laplace (both variance = 1)", xlab = "x", ylab = "density")
lines(y, exp(-abs(y) / b) / (2 * b), lwd = 2.5, col = red)
legend("topleft", c("N(0, 1)", "Laplace(0, b = 0.71)"), col = c(blue, red), lwd = 2.5, bty = "n")
text(3.3, 0.12, sprintf("P(|X| > 3):\nnormal %.2f%%\nLaplace %.2f%%", 2 * pnorm(-3) * 100, exp(-3 / b) * 100), cex = 0.85)
dev.off()
