package com.npt.orderservice.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.retry.support.RetryTemplate;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Cấu hình RestClient timeout và Spring Retry template để minh họa song song:
 * 1. OpenFeign vs Spring 6 RestClient timeout
 * 2. Resilience4j Retry vs Spring Retry (RetryTemplate)
 */
@Configuration
public class RestClientConfig {

    @Bean
    public RestClient userRestClient(@Value("${user-service.url:http://localhost:8081}") String userUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(1));
        factory.setReadTimeout(Duration.ofMillis(2500)); // 2.5 giây timeout ở tầng HTTP RestClient

        return RestClient.builder()
                .baseUrl(userUrl + "/api/users")
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RetryTemplate springRetryTemplate() {
        return RetryTemplate.builder()
                .maxAttempts(3)
                .exponentialBackoff(500, 2.0, 5000)
                .retryOn(Exception.class)
                .build();
    }
}
