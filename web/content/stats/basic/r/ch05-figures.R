# 第 5 章的 R 圖檔產生程式(標準常態、對數常態、平移指數、雙指數與常態的比較；深色、淺色各一張，樣式見 theme.R)
# 用法(在 little-trader 資料夾下)：Rscript web/content/stats/basic/r/ch05-figures.R web/content/stats/basic/img
.dir <- dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)))
source(file.path(.dir, "theme.R"))

lt_fig("ch05-shapes", 1040, 820, function(T) {
  par(mfrow = c(2, 2))
  # (1) 標準常態：±1、±2 個標準差內的機率
  z <- seq(-4, 4, length.out = 400)
  lt_frame(T, c(-4, 4), c(0, 0.42), main = "Standard normal  Z ~ N(0, 1)", xlab = "z", ylab = "density")
  s2 <- seq(-2, 2, length.out = 200); s1 <- seq(-1, 1, length.out = 200)
  polygon(c(-2, s2, 2), c(0, dnorm(s2), 0), col = lt_alpha(T$blue, 0.2), border = NA)
  polygon(c(-1, s1, 1), c(0, dnorm(s1), 0), col = lt_alpha(T$blue, 0.4), border = NA)
  lines(z, dnorm(z), lwd = 2.5, col = T$blue)
  text(0, 0.17, "68.3%", font = 2, col = T$fg); text(0, 0.03, "95.4%  (|z| < 2)", cex = 0.85, col = T$fg)
  # (2) 對數常態：μ = 0，σ 越大越右偏
  x <- seq(0.001, 4, length.out = 400)
  lt_frame(T, c(0, 4), c(0, 1.7), main = "Lognormal  ln X ~ N(0, sigma^2)", xlab = "x", ylab = "density")
  lines(x, dlnorm(x, 0, 0.25), lwd = 2.5, col = T$blue); lines(x, dlnorm(x, 0, 0.5), lwd = 2.5, col = T$amber); lines(x, dlnorm(x, 0, 1), lwd = 2.5, col = T$red)
  abline(v = 1, lty = 3, col = T$mute)
  lt_legend(T, "topright", c("sigma = 0.25", "sigma = 0.5", "sigma = 1"), c(T$blue, T$amber, T$red), lwd = 2.5)
  text(1.05, 1.62, "median = e^mu = 1", adj = 0, cex = 0.8, col = T$mute)
  # (3) 指數 vs 平移指數：形狀相同，整條往右移 theta
  t <- seq(0, 10, length.out = 400)
  lt_frame(T, c(0, 10), c(0, 0.55), main = "Exponential vs shifted exponential", xlab = "x", ylab = "density")
  lines(t, dexp(t, 0.5), lwd = 2.5, col = T$blue); lines(t, ifelse(t >= 2, 0.5 * exp(-0.5 * (t - 2)), 0), lwd = 2.5, col = T$amber)
  lt_legend(T, "topright", c("Exp(lambda = 0.5)", "shifted: theta = 2"), c(T$blue, T$amber), lwd = 2.5)
  # (4) 常態 vs 雙指數(變異數都是 1)：雙指數峰更尖、尾巴更厚
  y <- seq(-5, 5, length.out = 600); b <- 1 / sqrt(2)
  lt_frame(T, c(-5, 5), c(0, 0.75), main = "Normal vs Laplace (both variance = 1)", xlab = "x", ylab = "density")
  lines(y, dnorm(y), lwd = 2.5, col = T$blue); lines(y, exp(-abs(y) / b) / (2 * b), lwd = 2.5, col = T$red)
  lt_legend(T, "topleft", c("N(0, 1)", "Laplace(0, b = 0.71)"), c(T$blue, T$red), lwd = 2.5)
  text(3.3, 0.14, sprintf("P(|X| > 3):\nnormal %.2f%%\nLaplace %.2f%%", 2 * pnorm(-3) * 100, exp(-3 / b) * 100), cex = 0.85, col = T$fg)
})
