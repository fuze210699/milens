package main

import "accuracy-go/src/models"

type UserService struct {
	repo models.UserRepo
}

func NewUserService(repo models.UserRepo) *UserService {
	return &UserService{repo: repo}
}

func (s *UserService) Register(name, email string) *models.User {
	user := models.User{Name: name, Email: email}
	s.repo.Save(user)
	return &user
}
